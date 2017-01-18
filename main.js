const {app, BrowserWindow, Menu, Tray, ipcMain} = require('electron')
// Module to control application life.
//const app = electron.app
// Module to create native browser window.
//const BrowserWindow = electron.BrowserWindow

const path = require('path')
const fs = require('fs')
const url = require('url')
const notifier = require('node-notifier');

const config = require('./modules/Configuration.js');


//States definition
const STATUS_WORKING = 1;
const STATUS_SHORT_BREAK = 2;
const STATUS_LONG_BREAK = 3;

//Notifications
const NOTIFY_NEW_POMODORO = 1;
const NOTIFY_SHORT_BREAK = 2;
const NOTIFY_LONG_BREAK = 3;
const NOTIFY_TIMER_PAUSED = 4;
const NOTIFY_CONTINUE_POMODORO = 5;
const NOTIFY_CONTINUE_BREAK = 6;

let lang = {};
lang[NOTIFY_NEW_POMODORO] = "Starting a new pomodoro!";
lang[NOTIFY_SHORT_BREAK] = "Time for a short break!";
lang[NOTIFY_LONG_BREAK] = "Time for a long break!";
lang[NOTIFY_TIMER_PAUSED] = "Timer paused";
lang[NOTIFY_CONTINUE_POMODORO] = "Continue working";
lang[NOTIFY_CONTINUE_BREAK] = "Continue the break";


//Handles the internal state of the timer
let state = {
  paused: false,
  pomodorosDone: 0,
  status: STATUS_WORKING,
  left: 0,
  interval: null
};

//

// Keep a global reference of the window object, if you don't, the window will
// be closed automatically when the JavaScript object is garbage collected.
let mainWindow = null;
let forceQuit = false;

function createWindow() {
  // Create the browser window.
  mainWindow = new BrowserWindow({ width: 800, height: 600 })

  // and load the index.html of the app.
  mainWindow.loadURL(url.format({
    pathname: path.join(__dirname, 'index.html'),
    protocol: 'file:',
    slashes: true
  }))

  // Open the DevTools.
  mainWindow.webContents.openDevTools()

  // Emitted when the window is closed.
  mainWindow.on('close', function (event) {
    // Dereference the window object, usually you would store windows
    // in an array if your app supports multi windows, this is the time
    // when you should delete the corresponding element.
    mainWindow = null;
    async_receiver = null;
  })
}

// This method will be called when Electron has finished
// initialization and is ready to create browser windows.
// Some APIs can only be used after this event occurs.
//app.on('ready', createWindow)

// Quit when all windows are closed.
/*app.on('window-all-closed', function () {
  // On OS X it is common for applications and their menu bar
  // to stay active until the user quits explicitly with Cmd + Q
  if (process.platform !== 'darwin') {
    app.quit()
  }
})*/

app.on('activate', function () {
  // On OS X it's common to re-create a window in the app when the
  // dock icon is clicked and there are no other windows open.
  if (mainWindow === null) {
    createWindow()
  }
});

app.on('will-quit', function (event) {
  if (!forceQuit) event.preventDefault();

  // This is a good place to add tests insuring the app is still
  // responsive and all windows are closed.
});

// In this file you can include the rest of your app's specific main process
// code. You can also put them in separate files and require them here.

let tray = null
app.on('ready', () => {
  tray = new Tray('./images/icon-red.png');
  const contextMenu = Menu.buildFromTemplate([
    { label: 'Paused', type: 'checkbox', checked: false, click() { toggleInterval() } },
    { label: 'Exit', click() { forceQuit = true; app.quit(); } },
  ]);
  tray.setToolTip('This is my application.')
  tray.setContextMenu(contextMenu);
  tray.on('click', () => {
    if (mainWindow == null) createWindow();
    else mainWindow.close();
  });

  //createWindow();
})

function to2DigitsInt(n) {
  n = Math.floor(n);
  if (n < 10) return "0" + n;
  return n;
}

function formatTime(seconds) {
  let hours = to2DigitsInt(seconds / 3600);
  seconds = to2DigitsInt(seconds % 3600);
  let minutes = to2DigitsInt(seconds / 60);
  seconds = to2DigitsInt(seconds % 60);
  return hours + ":" + minutes + ":" + seconds;
}

ipcMain.on('timeleft', function (event, data) {
  event.returnValue = formatTime(state.left);
});

ipcMain.on('configuration-sync', function (event, data) {
  event.returnValue = config.map();
})

let async_receiver = null;

ipcMain.on('timeleft-async', function (event, data) {
  async_receiver = event.sender;
  event.sender.send('timeleft-async-reply', formatTime(state.left));
});

ipcMain.on('apply-config-async', function (event, data) {
  console.log(data);
  for (let key in data) {
    config.set(key, data[key]);
  }
  config.save();
});

function toggleInterval() {
  if (state.interval == null) {
    state.interval = setInterval(substract, 1000);
    state.paused = false;
    if (state.status == STATUS_WORKING) createNotification(NOTIFY_CONTINUE_POMODORO);
    else createNotification(NOTIFY_CONTINUE_BREAK);
  }
  else {
    clearInterval(state.interval);
    state.paused = true;
    state.interval = null;
    createNotification(NOTIFY_TIMER_PAUSED);
  }
}

function substract() {
  state.left -= 1;
  if (state.left == 0) {
    timerEnded();
  }
  //updateMenu();
  if (async_receiver != null) async_receiver.send('timeleft-async-reply', formatTime(state.left));
}

let interval = null;

function startInterval() {
  if (state.interval == null) state.interval = setInterval(substract, 1000);
}


function createNotification(notificationCode) {
  notifier.notify({
    title: 'Pomotron',
    message: lang[notificationCode],
    icon: path.join(__dirname, 'images', 'icon-red.png')
  });
}

function startPomodoro() {
  state.left = config.get("pomodoro_duration");
  state.status = STATUS_WORKING;
  startInterval();
  createNotification(NOTIFY_NEW_POMODORO);
}

function startShortBreak() {
  state.left = config.get("short_break_duration");
  state.status = STATUS_SHORT_BREAK;
  startInterval();
  createNotification(NOTIFY_SHORT_BREAK);
}

function startLongBreak() {
  state.left = config.get("long_break_duration");
  state.status = STATUS_LONG_BREAK;
  startInterval();
  createNotification(NOTIFY_LONG_BREAK);
}

function timerEnded() {
  switch (state.status) {
    case STATUS_WORKING:
      state.pomodorosDone += 1;
      if (state.pomodorosDone == config.get("num_pomodoros")) startLongBreak();
      else startShortBreak();
      break;
    case STATUS_SHORT_BREAK:
      startPomodoro();
      break;
    case STATUS_LONG_BREAK:
      state.pomodorosDone = 0;
      startPomodoro();
      break;
  }
}

startPomodoro();