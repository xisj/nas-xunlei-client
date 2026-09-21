#!/usr/bin/env bash
# 发布脚本 — nas-xunlei-client
# 用法:
#   ./docs/发布.sh v0.2.0                # 指定版本号发布
#   ./docs/发布.sh v0.2.0 "修复了xxx"     # 带更新说明
#   ./docs/发布.sh v0.2.0 --dry-run      # 只检查不推送
#   ./docs/发布.sh v0.2.0 --no-cask      # 跳过 Homebrew Cask 更新
#
# 脚本会自动:
#   1. 检查工作区干净
#   2. 同步 package.json / package-lock.json 版本号
#   3. 提交版本号改动
#   4. 打 tag 并推送，触发 GitHub Actions 构建 + 发布
#      （win32 / win64 / mac intel / mac arm 四个平台）
#   5. 等待 CI 构建完成，从 Release 下载 nas-xunlei-CHECKSUMS.txt，
#      更新 Casks/nas-xunlei.rb 的 version + 双架构 sha256，提交推送
#      （本地存在 homebrew-nas-xunlei tap 克隆时同步推送；
#        也可用 TAP_REPO_DIR=/path/to/tap 指定）
#
# 若 tag 已存在且 CI 已触发（例如上次发布中断在 cask 步骤之前），
# 直接重跑本脚本即可——会自动跳过构建步骤，只执行第 5 步。
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

push_branch() {
  git push origin main 2>/dev/null || git push origin master 2>/dev/null || warn "分支推送失败，请手动 git push"
}

# === 解析参数 ===
VERSION=""
MESSAGE=""
DRY_RUN=false
NO_CASK=false

for arg in "$@"; do
  case "$arg" in
    --dry-run) DRY_RUN=true ;;
    --no-cask) NO_CASK=true ;;
    v*) VERSION="$arg" ;;
    *) [ -z "$MESSAGE" ] && MESSAGE="$arg" || MESSAGE="$MESSAGE $arg" ;;
  esac
done

[ -z "$VERSION" ] && die "用法: $0 <版本号> [更新说明] [--dry-run] [--no-cask]
示例:
  $0 v0.2.0
  $0 v0.2.0 \"修复登录页保持登录自动勾选\""

# 去掉前缀 v 得到纯版本号
VER_NUM="${VERSION#v}"
[ "$VER_NUM" = "$VERSION" ] && VERSION="v$VER_NUM"

info "准备发布 ${VERSION}"

# === 1. 提前检查 tag 是否已存在 ===
# tag 已存在且 CI 已触发 → 跳过构建步骤，只做 cask 更新（发布中断后重跑场景）
SKIP_TO_CASK=false
if git tag -l "$VERSION" | grep -q "$VERSION"; then
  RUN_PROBE=$(gh run list --branch "$VERSION" --limit 1 --json databaseId --jq '.[0].databaseId' 2>/dev/null || true)
  if [ -n "$RUN_PROBE" ] && [ "$RUN_PROBE" != "null" ]; then
    warn "tag ${VERSION} 已存在且 CI 已触发，跳过构建步骤，仅执行 cask 更新"
    SKIP_TO_CASK=true
  else
    die "tag ${VERSION} 已存在且找不到对应 CI run。
如需重打请先: git tag -d ${VERSION} && git push origin :refs/tags/${VERSION}"
  fi
fi

if [ "$SKIP_TO_CASK" = false ]; then

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
push_branch
ok "代码已推送"

git push origin "$VERSION"
ok "tag ${VERSION} 已推送，GitHub Actions 已触发"

echo ""
echo "  查看构建进度: https://github.com/xisj/nas-xunlei-client/actions"
echo "  Release 页面: https://github.com/xisj/nas-xunlei-client/releases/tag/${VERSION}"
echo ""

fi # SKIP_TO_CASK

# === 10. 等待 CI 构建完成，更新 Homebrew Cask ===
if [ "$NO_CASK" = true ] || [ "$DRY_RUN" = true ]; then
  warn "跳过 Homebrew Cask 更新"
  exit 0
fi

command -v gh >/dev/null || die "需要 gh CLI 来等待 CI 并下载校验和（brew install gh）"

info "查找 ${VERSION} 对应的 CI run ..."
RUN_ID=""
for i in $(seq 1 60); do
  RUN_ID=$(gh run list --branch "$VERSION" --limit 1 --json databaseId --jq '.[0].databaseId' 2>/dev/null || true)
  [ -n "$RUN_ID" ] && [ "$RUN_ID" != "null" ] && break
  sleep 5
done
[ -z "$RUN_ID" ] || [ "$RUN_ID" = "null" ] && die "60 次尝试后仍未找到 CI run，请确认 Actions 已触发"

info "等待构建完成 (run ${RUN_ID}) ..."
if ! gh run watch "$RUN_ID" --exit-status --interval 15; then
  die "CI 构建失败，cask 未更新。修复后可重跑本脚本只更新 cask: $0 $VERSION"
fi
ok "CI 构建成功"

info "从 Release 下载校验和 ..."
TMP_DIR=$(mktemp -d)
trap 'rm -rf "$TMP_DIR"' EXIT
gh release download "$VERSION" --pattern '*CHECKSUMS*' --dir "$TMP_DIR" --clobber \
  || die "下载 CHECKSUMS 失败，确认 Release 已发布校验和文件"
SUMS_FILE=$(ls "$TMP_DIR"/*CHECKSUMS* 2>/dev/null | head -1)
[ -z "$SUMS_FILE" ] && die "Release 中未找到 CHECKSUMS 文件"
cat "$SUMS_FILE"

ARM_SHA=$(grep 'arm64.dmg' "$SUMS_FILE" | awk '{print $1}' | head -1)
INTEL_SHA=$(grep '\-x64.dmg' "$SUMS_FILE" | awk '{print $1}' | head -1)
[[ "$ARM_SHA" =~ ^[0-9a-f]{64}$ ]] || die "从 CHECKSUMS 解析 arm64 sha256 失败"
[[ "$INTEL_SHA" =~ ^[0-9a-f]{64}$ ]] || die "从 CHECKSUMS 解析 x64 sha256 失败"

CASK_FILE="Casks/nas-xunlei.rb"
[ -f "$CASK_FILE" ] || die "找不到 $CASK_FILE"

info "更新 $CASK_FILE → ${VER_NUM} ..."
sed -i '' -E "s|^(  version \")[^\"]*(\")|\1${VER_NUM}\2|" "$CASK_FILE"
sed -i '' -E "/on_arm do/,/^  end\$/ s|sha256 \"[0-9a-f]+\"|sha256 \"${ARM_SHA}\"|" "$CASK_FILE"
sed -i '' -E "/on_intel do/,/^  end\$/ s|sha256 \"[0-9a-f]+\"|sha256 \"${INTEL_SHA}\"|" "$CASK_FILE"
grep -nE 'version|sha256' "$CASK_FILE"

if [ -z "$(git diff --name-only -- "$CASK_FILE")" ]; then
  ok "cask 已是最新，无需提交"
else
  git add "$CASK_FILE"
  git commit -m "chore: cask 更新至 ${VERSION} 并同步新校验和"
  push_branch
  ok "cask 已更新并推送"
fi

# 同步到 tap 仓库（本地存在克隆时）
TAP_DIR="${TAP_REPO_DIR:-}"
if [ -z "$TAP_DIR" ]; then
  for d in ../homebrew-nas-xunlei "$HOME/code/homebrew-nas-xunlei" /Volumes/2t/code/homebrew-nas-xunlei; do
    if [ -d "$d/.git" ]; then TAP_DIR="$d"; break; fi
  done
fi
if [ -n "$TAP_DIR" ] && [ -d "$TAP_DIR" ]; then
  mkdir -p "$TAP_DIR/Casks"
  cp "$CASK_FILE" "$TAP_DIR/Casks/nas-xunlei.rb"
  git -C "$TAP_DIR" add Casks/nas-xunlei.rb
  if [ -z "$(git -C "$TAP_DIR" diff --cached --name-only)" ]; then
    ok "tap 仓库已是最新"
  else
    git -C "$TAP_DIR" commit -m "nas-xunlei ${VERSION}"
    git -C "$TAP_DIR" push
    ok "tap 仓库已推送: $TAP_DIR"
  fi
else
  warn "未找到 homebrew-nas-xunlei tap 本地克隆，brew 分发需手动把 Casks/nas-xunlei.rb"
  warn "  同步到 xisj/homebrew-nas-xunlei 仓库（或用 TAP_REPO_DIR=/path/to/tap 指定后重跑）"
fi

echo ""
ok "发布完成！"
echo "  Release: https://github.com/xisj/nas-xunlei-client/releases/tag/${VERSION}"
echo "  安装:    brew install --cask xisj/nas-xunlei/nas-xunlei"
echo ""
