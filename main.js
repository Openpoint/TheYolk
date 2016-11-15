'use strict'



const fs=require('fs');
const path=require('path');
const bootloader = require('./core/bootloader.js');
const {app, BrowserWindow, webContents, ipcMain} = require('electron');
//const spawn = require('child_process').spawn;
//const exec = require('child_process').execFile;
const child = require('child_process');
const boot = new bootloader();
const os = require('os');
//console.log(os.type().toLowerCase());
//console.log(os.arch().toLowerCase());

var str = JSON.stringify(process.env, null, 4);
console.log(str);


var dbaseReady = false;
//console.log(boot.modules)

// Keep a global reference of the window object, if you don't, the window will
// be closed automatically when the JavaScript object is garbage collected.
let win
//function start(){
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
			//console.log('window loaded');
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
	ipcMain.on('dbasestate', (event, data) => {
		event.sender.send('dbasestate',dbaseReady);
	})	
	ipcMain.on('track_relay', (event, data) => {
		event.sender.send('track',data);
		//event.sender.send('track'.data);
	})
	ipcMain.on('return', (event, req) => {
		switch(req) {
			case 'config':
				event.sender.send(req,boot);
			break;
		}
	})
//}

// In this file you can include the rest of your app's specific main process
// code. You can also put them in separate files and require them here.

//Check and/or get java version 1.8
var jre = child.spawn('java', ['-version']);
jre.on('error', function(err) {
  jre = false;
  java(jre);
});
jre.stderr.on('data', function(data) {
	data = `${data}`.split('\n')[0].split(' ');
	var version=data[data.length-1].replace(/"/g,'').split('.');
	console.log(version);
	if(version[0]==1 && version[1]==8){
		jre = true;
	}else{
		jre = false;
	}	
	java(jre);
})
function java(jre){
	console.log(jre)
	if(!jre){
		getJava();

	}else{
		elastic();
	}	
}
//Download JRE 1.8
function getJava(){
	
	const download = require('java-download')
	download({
		type: 'jre',
		version: 8,
		platform:os.type().toLowerCase(),
		arch:os.arch().toLowerCase()
	}, function (err, src) {
		if(err){
			console.log(err);
			return;
		}
		
		if(os.type().toLowerCase() === 'linux'){			
			//var file = child.spawnSync('cp',['-v',src,dest]);
			//src = file.stdout.toString('utf8').split('->')[1].trim().replace(/\'/g,'');
			var dest = path.join(boot.root,'core/lib');
			var file = child.spawnSync('tar',['xvzC',dest,'-f',src]);
			//console.log(file.stderr.toString('utf8'));
			process.env.JAVA_HOME = path.join(dest,file.stdout.toString('utf8').split('\n')[0]);
			elastic();
		}
	})
}

//Start the elasticsearch server
function elastic(){
	var elasticpath = path.join(boot.root,'core/lib/elasticsearch-5.0.0/bin/elasticsearch');
	var args = [
		'--cluster.name=local',
		'--node.name=yolk'
	]

	//var elasticsearch = spawn(elasticpath,args);
	var elasticsearch = child.exec('./core/lib/startdb.sh')
	elasticsearch.stdout.on('data', (data) => {
	  var string = (`${data}`);
	  console.log(string);
	  if(string.indexOf('[yolk] started') > -1){	  
		  dbaseReady = true;	  
	  }
	});	
}


boot.coreProcesses.forEach(function(file){
	require(file);
})








