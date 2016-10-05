'use strict'

const fs=require('fs');
const path=require('path');
const bootloader = require('./core/bootloader.js');
const {app, BrowserWindow, webContents, ipcMain} = require('electron');
const spawn = require('child_process').execFile;

var boot = new bootloader();
//console.log(boot.modules)

// Keep a global reference of the window object, if you don't, the window will
// be closed automatically when the JavaScript object is garbage collected.
let win

function createWindow () {
  // Create the browser window.
  win = new BrowserWindow({width: 800, height: 600})

  // and load the index.html of the app.
  win.loadURL(`file://${__dirname}/index.html`)


  // Open the DevTools.
  win.webContents.openDevTools()


  // Emitted when the window is closed.
  win.on('closed', () => {
    // Dereference the window object, usually you would store windows
    // in an array if your app supports multi windows, this is the time
    // when you should delete the corresponding element.
    win = null
  })
	win.webContents.on('did-finish-load',function(){
		console.log('window loaded');
	});
}

// This method will be called when Electron has finished
// initialization and is ready to create browser windows.
// Some APIs can only be used after this event occurs.
app.on('ready', createWindow)

// Quit when all windows are closed.
app.on('window-all-closed', () => {
  // On macOS it is common for applications and their menu bar
  // to stay active until the user quits explicitly with Cmd + Q
  if (process.platform !== 'darwin') {
    app.quit()
  }
})

app.on('activate', () => {
  // On macOS it's common to re-create a window in the app when the
  // dock icon is clicked and there are no other windows open.
  if (win === null) {
    createWindow()
  }
})

// In this file you can include the rest of your app's specific main process
// code. You can also put them in separate files and require them here.

//Start the elasticsearch server
process.env.JAVA_HOME = path.join(boot.root,'core/lib/jre1.8.0_101');
var elasticpath = path.join(boot.root,'core/lib/elasticsearch-2.4.0/bin/elasticsearch');
var elasticoptions = [
	'--cluster.name=player',
	'--node.name=test'
]
const elasticsearch = spawn(elasticpath,elasticoptions);

boot.coreProcesses.forEach(function(file){
	require(file);
})


ipcMain.on('return', (event, req) => {
	switch(req) {
		case 'config':
			event.sender.send(req,boot);
		break;
	}
})


