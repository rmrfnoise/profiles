# Profiles

Profiles 是一款运行在本机的人物档案管理应用，以纸本档案为视觉风格，所有数据保存在本地。

## 启动

- Windows：双击 `launch-profiles.cmd`。
- macOS：双击 `launch-profiles.command`。

首次运行缺少依赖时，启动器会自动安装并打开浏览器。

也可以使用命令行：

```bash
npm install
node server.js
```

打开 `http://127.0.0.1:3000`。

需要 Node.js 24 或更高版本。

## 数据

- 数据库：`data/profiles.db`，Windows 与 macOS 通用。
- 照片：`data/media/photos/`，与数据库一同属于个人数据。
- `data/` 下的数据库和照片都不纳入版本控制。
- 首次启动自动创建。
- 备份或跨设备复制前，请先停止服务，并备份整个 `data/` 目录。

## 说明

- 单用户本地应用，没有登录和权限系统。
- 服务仅监听 `127.0.0.1`，不提供局域网访问。
