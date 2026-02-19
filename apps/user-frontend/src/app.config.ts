export default defineAppConfig({
  pages: [
    "pages/home/index",
    "pages/editor/index",
    "pages/tasks/index",
    "pages/result/index",
    "pages/subscription/index",
    "pages/account/index"
  ],
  window: {
    navigationBarTitleText: "去水印",
    navigationBarBackgroundColor: "#ffffff",
    navigationBarTextStyle: "black",
    backgroundTextStyle: "light"
  },
  tabBar: {
    color: "#666666",
    selectedColor: "#1a73e8",
    list: [
      {
        pagePath: "pages/home/index",
        text: "首页"
      },
      {
        pagePath: "pages/tasks/index",
        text: "任务"
      },
      {
        pagePath: "pages/account/index",
        text: "我的"
      }
    ]
  }
});
