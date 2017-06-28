'use strict'

//log back to the renderer window
console.process=function(mess,type){
	if(type !== 'log' && mess.message){
		mess = mess.message;
	}
	try {
		throw new Error(mess)
	}
	catch(err){
		err = err.stack.split('\n');
		err.splice(1, 2);
		err[0]='Main process: '+err[1].trim();
		if(typeof mess ==='string' || typeof mess==='boolean' || typeof mess==='number'){
			err[1]= mess+''.trim();
		}else if(!mess){
			err[1]=''+mess;
		}else{
			var object = mess;
			err.splice(1, 1);
		}
		if(!object){
			err=[err[0],err[1]];
		}else{
			err=[err[0]];
		}
		err = err.join('\n');
		return {
			log:err,
			object:object
		}
	}

}
console.Yolk = {
	log:function(mess){
		if(process.env.ELECTRON_ENV !== 'development') return;
		mess = console.process(mess,"log");
		process.Yolk.message.send('log',{log:mess.log});
		if(mess.object){
			process.Yolk.message.send('log',{log:mess.object});
		}
	},
	warn:function(mess){
		if(process.env.ELECTRON_ENV !== 'development') return;
		mess = console.process(mess,"warn");
		process.Yolk.message.send('log',{warn:mess.log});
		if(mess.object){
			process.Yolk.message.send('log',{warn:mess.object});
		}
	},
	error:function(mess){
		if(process.env.ELECTRON_ENV !== 'development') return;
		mess = console.process(mess,"error");
		process.Yolk.message.send('log',{error:mess.log});
		if(mess.object){
			process.Yolk.message.send('log',{error:mess.object});
		}
	},
	say:function(mess){
		if(process.env.ELECTRON_ENV !== 'development') return;
		process.Yolk.message.send('log',{log:mess});
	}
};

//if(require('electron-squirrel-startup')) return;
process.Yolk = {};
const {app, BrowserWindow, webContents, ipcMain} = require('electron');
app.commandLine.appendSwitch('ignore-gpu-blacklist');
const fs=require('fs');
const http = require('http');
const path=require('path');
const Elastic = require('elasticsearch');
const child = require('child_process');
const os = require('os');
const kill = require('tree-kill');
Promise = require("bluebird");
Promise.config({cancellation: true});

const Installer = require('./core/lib/installer.js');
const bootloader = require('./core/lib/bootloader.js');
const ft = require('./core/lib/filetools.js');
const boot = new bootloader(path.resolve(__dirname));


const elasticversion = '5.3.0';
const elasticchecksum = '9273fdecb2251755887f1234d6cfcc91e44a384d';
const javaversion = 'jre1.8.0_131';
var installer;
var domReady;

process.on('uncaughtException',function(err){
	if(pid) kill(pid);
	console.error(err);
})

process.Yolk.modules = boot.modules;
process.Yolk.resolver = {};

//hook to call main functions from a renderer window
process.Yolk.remote = function(val){
	return process.Yolk[val];
}
process.Yolk.root = boot.root;
process.Yolk.home = boot.home;
process.Yolk.message = false;
process.Yolk.storedMesssage = {};

//signals that the renderer client is ready
process.Yolk.clientReady = function(){
	if(!process.Yolk.installed){
		installer = new Installer();
		install();
		process.Yolk.installed = true;
	}
	return boot.modules;
}
//tell the renderer that the database is ready
process.Yolk.dbReady = new Promise(function(resolve,reject){
	process.Yolk.resolver.dbReady = function(){
		resolve();
	}
});

//load the main core processes for a module
process.Yolk.coreprocess = function(module){
	if(boot.coreProcesses[module]){
		boot.coreProcesses[module].forEach(function(file){
			try{
				require(file);
			}
			catch(err){

				console.error(err);
				console.Yolk.error(file+'\nSee the main process console');
			}

		})
	}
}
process.Yolk.chrome = function(action){
	switch (action){
		case 'close':
			win.close();
		break;
		case 'min':
			win.minimize();
		break;
		case 'max':
			if(win.isFullScreen()){
				win.setFullScreen(false);
				if(win.isMaximized()){
					win.unmaximize();
				}
			}else{
				win.setFullScreen(true)
			}

		break;
		case 'devtools':
			win.webContents.openDevTools();
		break;
	}
}
process.Yolk.db = require(path.join(boot.root,'core/lib/elasticsearch.js'));


//Create the main browser window
// Keep a global reference of the window object, if you don't, the window will
// be closed automatically when the JavaScript object is garbage collected.
let win;
function createWindow () {
	win = new BrowserWindow({width: 1200, height: 900, frame:false, center:true, title:'Yolk',show:false});
	win.loadURL(`file://${__dirname}/index.html#!/boot`);
	//win.loadURL('chrome://gpu')
	process.Yolk.win = win;
	process.Yolk.message = win.webContents;
	win.once('ready-to-show', () => {
	  win.show()
	})
	if(process.env.ELECTRON_ENV === 'development') win.webContents.openDevTools();
	win.webContents.on('crashed',function(){
		console.log('Browser window crashed')
	})
	win.on('unresponsive',function(){
		console.log('Browser window unresponsive')
	})

	// Emitted when the window is closed.
	win.on('closed', () => {
		// Dereference the window object, usually you would store windows
		// in an array if your app supports multi windows, this is the time
		// when you should delete the corresponding element.
		win = null;
		if(pid) kill(pid);
		app.quit();
	})
}

/*
app.on('will-quit',()=>{
	console.log('will-quit')
})
app.on('gpu-process-crashed',()=>{
	console.log('gpu-process-crashed')
})
app.on('window-all-closed',()=>{
	console.log('window-all-closed')
})
app.on('before-quit',()=>{
	console.log('before-quit')
})
app.on('quit',()=>{
	console.log('quit')
})
app.on('gpu-process-crashed',()=>{
	console.log('gpu-process-crashed')
})
*/

// This method will be called when Electron has finished
// initialization and is ready to create browser windows.
// Some APIs can only be used after this event occurs.

app.on('ready', function(){
	createWindow();
	process.Yolk.javahome = path.join(boot.home,'.bin',javaversion);
	if(os.platform()!=='win32'){
		process.Yolk.elasticpath = path.join(boot.home,'.bin','elasticsearch-'+elasticversion,'bin','elasticsearch');
	}else{
		process.Yolk.elasticpath = path.join(boot.home,'.bin','elasticsearch-'+elasticversion,'bin','elasticsearch.bat');
	}
})

// Quit when all windows are closed.
app.on('window-all-closed', () => {
  // On macOS it is common for applications and their menu bar
  // to stay active until the user quits explicitly with Cmd + Q
  if (process.platform !== 'darwin') {
	app.quit()
  }
})

app.on('activate', function() {
  // On macOS it's common to re-create a window in the app when the
  // dock icon is clicked and there are no other windows open.
  if (win === null) {
	createWindow()
  }
})

ipcMain.on('track_relay', function(event, data) {
	event.sender.send('track',data);
})

ipcMain.on('domReady', function() {
	process.Yolk.message.send('install',process.Yolk.storedMesssage);
})

// In this file you can include the rest of your app's specific main process
// code. You can also put them in separate files and require them here.

var getJava = function(){
	installer.getJava().then(function(home){
		hasElastic(process.Yolk.javahome);
	},function(){
		console.log('Getting Java failed');
	});
}
var hasElastic = function(home){

	installer.hasElastic(process.Yolk.elasticpath).then(function(res){
		if(res){
			//console.log('Elasticsearch is installed');
			elastic(home);
		}else{
			console.log('Getting Elasticsearch');
			installer.getElastic(elasticversion,elasticchecksum).then(function(){
				elastic(home);
			});
		}
	});
}
function install(){
	installer.hasJava().then(function(res){
		//console.log('Java installed');
		hasElastic();
	},function(res){
		//console.log('Java not installed');
		if(!res){
			installer.hasJava(process.Yolk.javahome).then(function(res){
				//console.log('Java installed');
				hasElastic(process.Yolk.javahome);
			},function(){
				getJava();
			});
		}else{
			getJava();
		}
	});
}

//Start the elasticsearch server
var pid;
function elastic(home){
	process.Yolk.storedMesssage = {
		message:'Loading the database'
	};

	if(home){
		process.env.JAVA_HOME = home;
	}
	var args = [
		'-Epath.conf='+path.join(boot.home,'elasticsearch','config'),
		'-Epath.data='+path.join(boot.home,'elasticsearch','data'),
		'-Epath.logs='+path.join(boot.home,'elasticsearch','logs')
	];

	process.Yolk.elasticsearch = child.spawn(process.Yolk.elasticpath,args);
	process.Yolk.elasticsearch.stdout.on('data', function(data){
		var string = (`${data}`);
		var trimmed = string.split('[yolk]')[1];
		var p = string.match(/pid\[([^\]]+)\]/);
		if(p) pid = p[1];

		if(win && trimmed){
			process.Yolk.storedMesssage.log = trimmed.replace(/\/n/g,'').trim();
			process.Yolk.message.send('install',process.Yolk.storedMesssage);
		}
		if(string.indexOf('[RED] to [YELLOW]') > -1 || string.indexOf('[RED] to [GREEN]') > -1 || string.indexOf('[yolk] recovered [0] indices into cluster_state') > -1){
			process.Yolk.resolver.dbReady();
		}
	});
}
