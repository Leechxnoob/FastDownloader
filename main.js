const {
    app,
    BrowserWindow,
    ipcMain,
    dialog,
    Notification,
    screen,
    Menu,
    Tray,
    MenuItem,
    clipboard
} = require("electron");
const {autoUpdater} = require("electron-updater");
const AutoLaunch = require("auto-launch");
const path = require("path");

let autoLauncher = null;

__dirname = __dirname.replaceAll("/resources/app.asar".replaceAll("/", path.sep), "");

let win = null, trayIcon = null, trayMenu = Menu.buildFromTemplate([]);
let lang = null, hidden = false;
let language = {};

function createWindow() {
    const {getCursorScreenPoint, getDisplayNearestPoint} = screen;
    const currentScreen = getDisplayNearestPoint(getCursorScreenPoint());

    win = new BrowserWindow({
        icon: __dirname + "/resources/icons/256x256.png".replaceAll("/", path.sep),
        minWidth: 900,
        minHeight: 580,
        x: currentScreen.workArea.x,
        y: currentScreen.workArea.y,
        autoHideMenuBar: true,
        webPreferences: {
            nodeIntegration: true,
            nodeIntegrationInWorker: true,
            nodeIntegrationInSubFrames: true,
            contextIsolation: false
        }
    });

    win.center();
    win.loadFile("app/index.html".replaceAll("/", path.sep)).then(() => {
        trayIcon = new Tray(__dirname + "/resources/icons/256x256.png".replaceAll("/", path.sep));
        trayIcon.setTitle("Fast Downloader");
        trayIcon.setToolTip("Fast Downloader");

        ipcMain.on("lang", (event, selectedLang, selectedLanguage) => {
            lang = selectedLang;
            language = selectedLanguage;

            trayMenu = Menu.buildFromTemplate([
                {id: "hide", label: language["hide"], type: "normal", click: hide},
                {id: "addUrl", label: language["addUrl"], type: "normal", click: addURL},
                {id: "download", label: language["download"], type: "normal", click: download},
                {id: "location", label: language["location"], type: "normal", click: location},
                {id: "clear", label: language["clear"], type: "normal", click: clear},
                {id: "close", label: language["close"], type: "normal", click: exit}
            ]);

            trayIcon.setContextMenu(trayMenu);

            win.on("hide", () => {
                hidden = true;

                removeTrayItem("hide");
                addTrayItem("maximize", language["maximize"], "normal", maximize);

                trayIcon.setContextMenu(Menu.buildFromTemplate(trayMenu.items));

            });

            win.on("show", () => {
                hidden = false;

                removeTrayItem("maximize");
                addTrayItem("hide", language["hide"], "normal", hide);

                trayIcon.setContextMenu(Menu.buildFromTemplate(trayMenu.items));
            });
        });
    });

    autoLauncher = new AutoLaunch({
        name: "FastDownloader",
        path: app.getPath("exe"),
    });
}

app.on("window-all-closed", () => {
    if (process.platform !== "darwin") {
        app.quit()
    }
});

app.on("activate", () => {
    if (win === null) createWindow();
});

ipcMain.on("restart", () => {
    app.relaunch();
    app.exit();
});

ipcMain.on("app_version", (event) => {
    event.sender.send("app_version", {version: app.getVersion()});
});

ipcMain.on("dir_name", (event) => {
    event.sender.send("dir_name", __dirname);
});

ipcMain.on("restart_app", () => {
    autoUpdater.quitAndInstall();
});

ipcMain.on("set_percentage", (event, percentage) => {
    win.setProgressBar(percentage, {mode: "normal"});
});

ipcMain.on("open_file_dialog", () => {
    dialog.showOpenDialog({
        properties: ["openDirectory"]
    }).then(function (files) {
        if (!files.canceled)
            win.webContents.send("selected_file", files.filePaths);
    });
});

ipcMain.on("show_notification", (event, title, message) => {
    showNotification(title, message);
});

ipcMain.on("add_abort", () => {
    removeTrayItem("download");
    addTrayItem("abort", language["abort"], "normal", abort);

    trayIcon.setContextMenu(Menu.buildFromTemplate(trayMenu.items));
});

ipcMain.on("remove_abort", () => {
    removeTrayItem("abort");
    addTrayItem("download", language["download"], "normal", download);

    trayIcon.setContextMenu(Menu.buildFromTemplate(trayMenu.items));
});

ipcMain.on("enableCloseToTray", () => {
    win.on("close", closeToTray);
});

ipcMain.on("disableCloseToTray", () => {
    win.off("close", closeToTray);
});

ipcMain.on("enableAutostart", () => {
    autoLauncher.isEnabled().then((isEnabled) => {
        if (!isEnabled) autoLauncher.enable();
    });
});

ipcMain.on("disableAutostart", () => {
    autoLauncher.isEnabled().then((isEnabled) => {
        if (isEnabled) autoLauncher.disable();
    });
})

function closeToTray(event) {
    event.preventDefault();
    win.hide();

    return false;
}

function showNotification(title, message) {
    new Notification({
        title: title,
        body: message,
        icon: __dirname + "/app/assets/ico/icon_64x64.png".replaceAll("/", path.sep)
    }).show();
}

function addTrayItem(id, label, type, click) {
    for (let trayItem of trayMenu.items)
        if (trayItem.id === id) return;

    trayMenu.items.unshift(new MenuItem({id: id, label: label, type: type, click: click}));
}

function removeTrayItem(id) {
    for (let i = 0; i < trayMenu.items.length; i++) {
        if (trayMenu.items[i].id === id) {
            trayMenu.items.splice(i, 1);
            break;
        }
    }
}

function exit() {
    app.exit(0);
}

function hide() {
    win.hide();
}

function maximize() {
    win.show();
}

function download() {
    win.webContents.send("download");
}

function abort() {
    win.webContents.send("abort");
}

function clear() {
    win.webContents.send("clear");
}

function location() {
    win.webContents.send("location");
}

function addURL() {
    win.webContents.send("translate", [["js", "error"], ["js", "noClipboard"]]);

    ipcMain.once("translation", (event, translations) => {
        let value = clipboard.readText();

        if (!value)
            showNotification(translations[0], translations[1]);
        else win.webContents.send("url", value);
    });
}

app.whenReady().then(() => {
    if (process.platform === "win32")
        app.setAppUserModelId("fm.bernardo.fastDownloader");

    autoUpdater.checkForUpdatesAndNotify().then((result) => {
        if (result && typeof result.downloadPromise !== "undefined") {
            win.webContents.send("update_available", result.updateInfo.version);

            autoUpdater.once("update-downloaded", () => {
                win.webContents.send("update_downloaded");
            });
        } else {
            let updateInterval = null;

            ipcMain.once("app_upto_date", () => {
                clearInterval(updateInterval);
            });

            updateInterval = setInterval(() => {
                win.webContents.send("app_upto_date");
            }, 50);
        }
    });

    createWindow();
});
