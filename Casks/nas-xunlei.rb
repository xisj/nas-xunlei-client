cask "nas-xunlei" do
  version "1.3.10"

  on_arm do
    sha256 "3e5c0bf19cab0f383cce14726d1b8e7691ee08b9b3b18ddff4d00fb08ad7956f"

    url "https://github.com/xisj/nas-xunlei-client/releases/download/v#{version}/nas-xunlei-#{version}-arm64.dmg"
  end
  on_intel do
    sha256 "2ead82a8247f1790b4bf6468ca3ee754aa132281882c67a7aba0f1114bdf6192"

    url "https://github.com/xisj/nas-xunlei-client/releases/download/v#{version}/nas-xunlei-#{version}-x64.dmg"
  end

  name "nas迅雷"
  desc "NAS 迅雷下载站桌面客户端"
  homepage "https://github.com/xisj/nas-xunlei-client"

  auto_updates true
  depends_on :macos

  app "nas迅雷.app"

  # 应用未经 Apple 公证（未购买开发者证书），安装后移除 quarantine 属性，
  # 否则 Apple Silicon 上首次启动会被 Gatekeeper 拦截（提示"已损坏"）。
  postflight_steps do
    run "/usr/bin/xattr",
        args: ["-dr", "com.apple.quarantine", "{{appdir}}/nas迅雷.app"]
  end

  zap trash: [
    "~/Library/Application Support/synology-xunlei-client",
    "~/Library/Preferences/com.xisj.nas-xunlei.plist",
  ]

  caveats <<~EOS
    应用未经 Apple 公证（未购买开发者证书），安装时会自动移除 quarantine 属性以便直接打开。
    若仍提示"无法验证开发者"或"已损坏"，手动执行：

      xattr -dr com.apple.quarantine "#{appdir}/nas迅雷.app"

    应用支持自动更新（electron-updater），升级时无需重新安装本 cask。
  EOS
end
