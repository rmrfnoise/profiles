# Profiles

本地人物档案应用，数据保存在本机 SQLite。

## 功能

- 记录人物资料、联系方式、地址、社交账号、兴趣与自定义字段。
- 支持对等关系与角色关系，并提供关系图。
- 支持按档案内容和关系称呼搜索。
- 支持新建、编辑、删除和头像上传。

## 启动

- Windows：双击项目根目录的 `launch-profiles.cmd`，它相当于 Windows 启动快捷方式。
- macOS：双击 `launch-profiles.command`。服务在 Terminal 中运行，关闭窗口即可停止。

首次运行如果缺少依赖，启动器会自动执行 `npm install`，完成后启动服务并打开浏览器。

也可以使用命令行：

```bash
npm install
node server.js
```

打开 `http://localhost:3000`。

需要 Node.js 24 或更高版本。

## 数据

- 数据库：`data/profiles.db`，Windows 和 macOS 通用。
- 首次启动自动创建。
- 停止服务后复制该文件即可备份或跨设备覆盖。
- 如果同目录存在 `-wal`、`-shm`，请与主文件一起复制；覆盖目标库前先删除目标目录里的旧 `-wal`、`-shm`。
- 这是手动快照，不是实时同步：最后一次覆盖生效，两边同时修改不会自动合并。
- 清空数据：停止服务，删除 `data/profiles.db` 及同目录的 `-wal`、`-shm` 文件。

## 说明

- 单用户本地应用，没有登录和权限系统。
- 不建议直接暴露到公网。
