"use strict";

const {BrowserWindow,ipcMain} = require('electron');
const path = require('path');

ipcMain.on('youtube_window', function(event){
	process.Yolk.youtube_window = new BrowserWindow({
		show:false,
		resizable:false,
		autoHideMenuBar:true,
		width:300,
		height:300,
		center:true,
		fullscreenable:false,
		webPreferences:{
		  nodeIntegration: false,
		  webSecurity: true,
		  preload:path.join(process.Yolk.root,'core/modules/musicPlayer/lib/tools/youtube.js')
		}
	})
	process.Yolk.youtube_window.webContents.on('new-window',function(event,url,frameName,disposition,options){
		event.preventDefault();
		process.Yolk.win.send('location',url)
	})
	event.returnValue = true;
})
