export default defineAppConfig({
  pages: [
    "pages/home/index",
    "pages/editor/index",
    "pages/tasks/index",
    "pages/result/index",
    "pages/account/index",
    "pages/login/index",
    "pages/register/index"
  ],
  window: {
    navigationBarTitleText: "去水印",
    navigationBarBackgroundColor: "#ffffff",
    navigationBarTextStyle: "black",
    backgroundTextStyle: "light"
  },
  tabBar: {
    color: "#94a3b8",
    selectedColor: "#3b82f6",
    backgroundColor: "#ffffff",
    borderStyle: "white",
    list: [
      {
        pagePath: "pages/home/index",
        text: "首页",
        iconPath: "./assets/tabbar/home.png",
        selectedIconPath: "./assets/tabbar/home-active.png"
      },
      {
        pagePath: "pages/tasks/index",
        text: "任务",
        iconPath: "./assets/tabbar/tasks.png",
        selectedIconPath: "./assets/tabbar/tasks-active.png"
      },
      {
        pagePath: "pages/account/index",
        text: "我的",
        iconPath: "./assets/tabbar/user.png",
        selectedIconPath: "./assets/tabbar/user-active.png"
      }
    ]
  }
});
