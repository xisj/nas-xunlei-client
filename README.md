# nas-xunlei-client
给群晖nas的迅雷开发的本地客户端，每次点击或者复制下载链接后都会自动弹出下载框。理论上可以用于各个品牌的nas

下载地址： https://github.com/xisj/nas-xunlei-client/releases

## macOS 安装

**方式一：Homebrew（推荐）**

需要 [Homebrew](https://brew.sh)，然后在终端执行：

```
brew tap xisj/nas-xunlei
brew trust xisj/nas-xunlei
brew install --cask nas-xunlei
```

> `brew trust` 只需执行一次（Homebrew 7 起第三方 tap 默认不被信任）。

应用未购买 Apple 开发者证书、未经公证，cask 安装时会自动移除 quarantine 属性，装完即可直接打开，无需额外操作。升级时用应用内的自动更新即可，也可以随时 `brew upgrade --cask nas-xunlei`。

**方式二：手动安装 dmg**

1. 在 [Releases](https://github.com/xisj/nas-xunlei-client/releases) 下载 `nas-xunlei-<版本>-arm64.dmg`（Intel Mac 用 `x64`）
2. 若打开提示"已损坏，无法打开"，先执行（把文件名换成实际的）：

```
xattr -cr ~/Downloads/nas-xunlei-<版本>-arm64.dmg
```

3. 打开 dmg，把 nas迅雷 拖入「应用程序」

## 功能
1. 打开 nas 下载文件夹 ， 可以直接打开下载任务的文件夹
2. 速度球查看下载进度
3. 绑定下载协议，点击后自动激活迅雷下载
4. 退出程序后彻底退出



<img width="1098" height="722" alt="Kapture" src="https://github.com/user-attachments/assets/3b9917a7-e0d2-46a2-8c4b-cad468534455" />



<img width="638" height="197" alt="image" src="https://github.com/user-attachments/assets/4437ac19-d372-421a-bbb6-4334d8116686" />


<img width="1322" height="867" alt="图片" src="https://github.com/user-attachments/assets/3c23c66d-9d1b-455b-b5c9-9fb3d742000c" />

<img width="1322" height="867" alt="图片" src="https://github.com/user-attachments/assets/d930d756-b10e-40ef-859b-851d9072d00d" />


