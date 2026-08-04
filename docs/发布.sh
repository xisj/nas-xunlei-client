#!/usr/bin/env bash
# 发布脚本 — nas-xunlei-client
# 用法:
#   ./docs/发布.sh v0.2.0                # 指定版本号发布
#   ./docs/发布.sh v0.2.0 "修复了xxx"     # 带更新说明
#   ./docs/发布.sh v0.2.0 --dry-run      # 只检查不推送
#
# 脚本会自动:
#   1. 检查工作区干净
#   2. 同步 package.json / package-lock.json 版本号
#   3. 提交版本号改动
#   4. 打 tag 并推送，触发 GitHub Actions 构建 + 发布
#      （win32 / win64 / mac intel / mac arm 四个平台）
set -euo pipefail

cd "$(git rev-parse --show-toplevel)"

# === 颜色 ===
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
NC='\033[0m'

info()  { echo -e "${CYAN}[INFO]${NC} $*"; }
ok()    { echo -e "${GREEN}[OK]${NC} $*"; }
warn()  { echo -e "${YELLOW}[WARN]${NC} $*"; }
die()   { echo -e "${RED}[ERROR]${NC} $*"; exit 1; }

# === 解析参数 ===
VERSION=""
MESSAGE=""
DRY_RUN=false

for arg in "$@"; do
  case "$arg" in
    --dry-run) DRY_RUN=true ;;
    v*) VERSION="$arg" ;;
    *) [ -z "$MESSAGE" ] && MESSAGE="$arg" || MESSAGE="$MESSAGE $arg" ;;
  esac
done

[ -z "$VERSION" ] && die "用法: $0 <版本号> [更新说明] [--dry-run]
示例:
  $0 v0.2.0
  $0 v0.2.0 \"修复登录页保持登录自动勾选\"" 

# 去掉前缀 v 得到纯版本号
VER_NUM="${VERSION#v}"
[ "$VER_NUM" = "$VERSION" ] && VERSION="v$VER_NUM"

info "准备发布 ${VERSION}"

# === 1. 提前检查 tag 是否已存在 ===
if git tag -l "$VERSION" | grep -q "$VERSION"; then
  die "tag ${VERSION} 已存在，如需重打请先: git tag -d ${VERSION}"
fi

# === 2. 检查工作区（只关注已跟踪文件的改动，忽略未跟踪文件）===
TRACKED_CHANGES=$(git diff --name-only; git diff --cached --name-only)
if [ -n "$TRACKED_CHANGES" ]; then
  warn "已跟踪文件有未提交的改动:"
  echo "$TRACKED_CHANGES" | sed 's/^/  /'
  echo ""
  read -rp "是否先提交这些改动? [y/N] " yn
  case "$yn" in
    [Yy]*)
      git add -u
      [ -z "$MESSAGE" ] && MESSAGE="prepare ${VERSION}"
      git commit -m "$MESSAGE"
      ok "已提交改动"
      ;;
    *)
      die "请先处理工作区改动再发布"
      ;;
  esac
else
  ok "工作区干净（未跟踪文件已忽略）"
fi

# === 3. 提醒 GitHub 配置 ===
info "提醒: 本项目无需配置 Secret（未启用代码签名/公证）。"
info "      确保 GitHub 仓库 Actions 处于启用状态，推送 tag 即可触发构建。"

# === 4. 构建检查 ===
info "语法检查 ..."
for f in src/main.js src/common/global.js src/common/func.js \
         src/common/tray.js src/common/menu.js \
         src/module/mainWindow/mainWindow.js src/module/mainWindow/preload.js; do
  node --check "$f" || die "语法检查失败: $f"
done
ok "语法检查通过"

info "重新构建设置页 (ui2 -> assets) ..."
npm run build:ui2
ok "设置页构建通过"

# === 5. 同步版本号 ===
info "同步版本号到 ${VER_NUM} ..."
npm version "${VER_NUM}" --no-git-tag-version --allow-same-version
ok "package.json / package-lock.json → ${VER_NUM}"

# === 6. 验证版本号 ===
info "验证版本号 ..."
PKG_VER=$(grep -o '"version": *"[^"]*"' package.json | head -1 | sed 's/.*"\(.*\)"$/\1/')
LOCK_VER=$(grep -o '"version": *"[^"]*"' package-lock.json | head -1 | sed 's/.*"\(.*\)"$/\1/')
if [ "$PKG_VER" != "$VER_NUM" ] || [ "$LOCK_VER" != "$VER_NUM" ]; then
  die "版本号不一致:
  package.json:        $PKG_VER
  package-lock.json:   $LOCK_VER
  期望: $VER_NUM"
fi
ok "版本号均为 ${VER_NUM}"

# === 7. 提交版本号改动 ===
info "提交版本号改动 ..."
git add package.json package-lock.json
# build:ui2 若改动了已提交的 assets 也一并提交
git add -u src/module/mainWindow/assets

if [ -z "$(git diff --cached --name-only)" ]; then
  warn "版本号未变化（可能已经是 ${VERSION}），跳过提交"
else
  COMMIT_MSG="release ${VERSION}"
  [ -n "$MESSAGE" ] && COMMIT_MSG="${COMMIT_MSG}

${MESSAGE}"
  git commit -m "$COMMIT_MSG"
  ok "已提交: ${COMMIT_MSG}"
fi

# === 8. 打 tag ===
info "打 tag ..."
TAG_MSG="${VERSION}"
[ -n "$MESSAGE" ] && TAG_MSG="${MESSAGE}"

git tag -a "$VERSION" -m "$TAG_MSG"
ok "已打 tag: ${VERSION}"

# === 9. 推送 ===
if [ "$DRY_RUN" = true ]; then
  warn "--dry-run 模式，不推送。以下命令未执行:"
  echo "  git push origin main"
  echo "  git push origin ${VERSION}"
  exit 0
fi

info "推送到远程 ..."
git push origin main 2>/dev/null || git push origin master 2>/dev/null || warn "分支推送失败，请手动 git push"
ok "代码已推送"

git push origin "$VERSION"
ok "tag ${VERSION} 已推送，GitHub Actions 已触发"

echo ""
ok "发布流程已启动！"
echo ""
echo "  查看构建进度: https://github.com/xisj/nas-xunlei-client/actions"
echo "  Release 页面: https://github.com/xisj/nas-xunlei-client/releases/tag/${VERSION}"
echo ""
