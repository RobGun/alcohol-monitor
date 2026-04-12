# Alcohol Monitor

这个项目是一个可直接部署到 GitHub Pages 的静态网页。

## 发布前文件

- `index.html`：GitHub Pages 默认入口，会跳转到 `饮酒监控器.html`
- `饮酒监控器.html`：实际页面

## 最短发布步骤

1. 在 GitHub 新建一个仓库，例如 `alcohol-monitor`
2. 把当前目录里的 `index.html`、`饮酒监控器.html`、`README.md` 上传到仓库根目录
3. 打开仓库的 `Settings`
4. 进入 `Pages`
5. 在 `Build and deployment` 里选择：
   - `Source`: `Deploy from a branch`
   - `Branch`: `main`
   - Folder: `/ (root)`
6. 保存后等待 1 到 3 分钟
7. GitHub 会给出一个网址，格式通常类似：
   `https://你的用户名.github.io/alcohol-monitor/`

## 手机上使用

1. 用手机浏览器打开 GitHub Pages 网址
2. 在浏览器里选择“添加到主屏幕”
3. 以后就可以像普通网页 App 一样打开

## 重要说明

当前数据保存在浏览器本地 `localStorage` 中，所以：

- 电脑浏览器里的数据和手机浏览器里的数据不会自动同步
- 同一台手机换浏览器后，数据通常也不会共享
