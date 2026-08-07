#!/bin/bash
# 修复 nas迅雷 无法打开（未签名/已损坏）问题
# 原理：移除 macOS 扩展属性中的隔离标记

APP_PATH="/Applications/nas迅雷.app"

echo "============================================"
echo "  nas迅雷 - 修复无法打开问题"
echo "============================================"
echo ""

# 检查应用是否存在
if [ ! -d "$APP_PATH" ]; then
    echo "❌ 未找到 $APP_PATH"
    echo "请先将 nas迅雷 拖到「应用程序」文件夹，再运行此脚本。"
    echo ""
    read -n 1 -s -r -p "按任意键退出..."
    exit 1
fi

echo "找到应用: $APP_PATH"
echo ""

# 移除扩展属性（隔离标记、com.apple.quarantine 等）
echo "正在移除隔离属性..."
sudo xattr -cr "$APP_PATH"

if [ $? -eq 0 ]; then
    echo ""
    echo "✅ 修复完成！现在可以正常打开 nas迅雷 了。"
    echo ""
    echo "如果仍然无法打开，请尝试："
    echo "  1. 系统设置 → 隐私与安全性 → 找到提示并点击「仍要打开」"
    echo "  2. 在应用程序中右键点击 nas迅雷 → 打开"
else
    echo ""
    echo "❌ 修复失败，请尝试手动操作："
    echo "  打开终端，执行: sudo xattr -cr \"$APP_PATH\""
fi

echo ""
read -n 1 -s -r -p "按任意键退出..."
