'use strict'

/*
Copyright 2017 Michael Jonker (http://openpoint.ie)
This file is part of The Yolk.
The Yolk is free software: you can redistribute it and/or modify
it under the terms of the GNU General Public License as published by
the Free Software Foundation, either version 3 of the License, or
any later version.
The Yolk is distributed in the hope that it will be useful,
but WITHOUT ANY WARRANTY; without even the implied warranty of
MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
GNU General Public License for more details.
You should have received a copy of the GNU General Public License
along with The Yolk.  If not, see <http://www.gnu.org/licenses/>.
*/

process.Yolk = {};
const {app, BrowserWindow, webContents, ipcMain, session, Menu} = require('electron');
//app.commandLine.appendSwitch('disable-smooth-scrolling');

const fs=require('fs');
const http = require('http');
const path=require('path');
const Elastic = require('elasticsearch');
const child = require('child_process');
const os = require('os');
const kill = require('tree-kill');
const isOnline = require('is-online');

if(os.platform()!=='darwin') app.commandLine.appendSwitch('ignore-gpu-blacklist');

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
var closing = false;
var message = function(type,message){
	if(process.Yolk.message && !closing){
		process.Yolk.message.send(type,message);
	}
}

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
process.Yolk.BrowserWindow = BrowserWindow;
process.Yolk.session = session;
process.Yolk.version = require('../package.json').version;
process.Yolk.online = false;
const menu = Menu.buildFromTemplate([])
Menu.setApplicationMenu(menu)
var online = function(){
	isOnline({timeout:1000}).then(o => {
	    process.Yolk.online = o;
		setTimeout(function(){
			online();
		},1000)
	});
}
online();

//signals that the renderer client is ready
process.Yolk.clientReady = function(){
	if(!process.Yolk.installed){
		installer = new Installer();
		install();
		process.Yolk.installed = true;
	}
}
process.Yolk.set  = function(module,data){
	process.Yolk.modules[module].config.settings = data;
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
			if(win.isFullScreen()){
				win.setFullScreen(false);
				return;
			}
			win.minimize();
		break;
		case 'max':
			if(os.platform()==='darwin'){
				win.setFullScreen(win.isFullScreen()?false:true);
				return;
			}
			if(win.isMaximized()){
				win.unmaximize();
			}else{
				win.maximize();
			}

		break;
		case 'devtools':
			win.webContents.openDevTools();
		break;
	}
}
//downgrade a process priority
process.Yolk.priority = function(pid){
	if(os.platform()==='win32'){
		child.exec('wmic process where ProcessId="'+pid+'" CALL setpriority "below normal"');
		child.exec('wmic process where ParentProcessId="'+pid+'" CALL setpriority "below normal"');
	}else{
		var ren = child.spawnSync('renice',['-n 19','-p $(./renicer.sh '+pid+')'],{shell:true});
		if(ren.error) console.Yolk.error(ren.error);
	}
}
process.on('uncaughtException',function(err){
	console.error(err);
})
//Create the main browser window
// Keep a global reference of the window object, if you don't, the window will
// be closed automatically when the JavaScript object is garbage collected.
let win;
function createWindow () {
	win = new BrowserWindow({
		width: 1200,
		height: 900,
		frame:false,
		center:false,
		x:10,
		y:10,
		title:'The Yolk',
		show:false,

	});

	win.loadURL(`file://${__dirname}/index.html#!/boot`);
	//win.loadURL('chrome://gpu')
	process.Yolk.win = win;
	process.Yolk.message = win.webContents;
	win.once('ready-to-show', () => {
	  win.show()
	})
	if(process.env.ELECTRON_ENV === 'development') win.webContents.openDevTools();
	win.webContents.on('crashed',function(){
		console.log('Browser window crashed');
		if(pid) kill(pid);
		app.quit();
	})
	win.on('unresponsive',function(){
		console.log('Browser window unresponsive')
	})
	win.on('close', () => {
		closing = true;
	})
	// Emitted when the window is closed.
	win.on('closed', () => {
		// Dereference the window object, usually you would store windows
		// in an array if your app supports multi windows, this is the time
		// when you should delete the corresponding element.
		win = null;
		app.quit();
		if(pid) kill(pid);
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
	/*
	var name = process.argv[0].split('/');
	name = name[name.length-1];
	var pids = child.execSync('pgrep '+name);
	pids = pids.toString().split('\n').filter(function(pid){
		if(pid){
			var arg = child.execSync('ps -p '+pid+' -o args').toString().split('\n')[1];
			console.log(arg+' -- '+pid)
			if(arg.indexOf('type=gpu-process') === -1){
				child.exec('renice -n 19 -p '+pid);
				return true;
			}
		}
	});
	console.log(pids);
	*/
	createWindow();
	if(os.platform()!=='darwin'){
		process.Yolk.javahome = path.join(boot.home,'.bin',javaversion);
	}else{
		process.Yolk.javahome = path.join(boot.home,'.bin',javaversion+'.jre','Contents','Home');
	}

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

ipcMain.on('domReady', function() {
	message('install',process.Yolk.storedMesssage);
})

var getJava = function(){
	installer.getJava().then(function(home){
		hasElastic(process.Yolk.javahome);
	},function(errors){
		process.Yolk.storedMesssage.java='error';
		message('install',process.Yolk.storedMesssage.message);
	});
}
var hasElastic = function(home){

	installer.hasElastic(process.Yolk.elasticpath).then(function(res){
		if(res){
			elastic(home);
		}else{
			installer.getElastic(elasticversion,elasticchecksum).then(function(){
				console.log('got elastic: ' + home)
				elastic(home);
			},function(errors){
				process.Yolk.storedMesssage.elastic=elasticversion;
				message('install',process.Yolk.storedMesssage);
			});
		}
	});
}
function install(){
	installer.hasJava(process.Yolk.javahome).then(function(res){
		hasElastic(process.Yolk.javahome);
	},function(){
		getJava();
	});

	/*
	installer.hasJava().then(function(res){
		hasElastic();
	},function(res){
		if(!res){
			installer.hasJava(process.Yolk.javahome).then(function(res){
				hasElastic(process.Yolk.javahome);
			},function(){
				getJava();
			});
		}else{
			getJava();
		}
	});
	*/
}

//Start the elasticsearch server
var pid;
function elastic(home){
	process.Yolk.storedMesssage = {
		message:'Loading the database'
	};
	console.log(home);
	process.env.JAVA_HOME = home;
	/*
	if(os.platform()!=='darwin'){
		process.env.JAVA_HOME = home;
	}else{
		//process.env.JAVA_HOME ="/Library/Internet\ Plug-Ins/JavaAppletPlugin.plugin/Contents/Home/bin";
		//console.log(process.env.JAVA_HOME)
	}
	*/
	if(os.platform()!=='win32'){
		var args = [
			'-Epath.conf='+path.join(boot.home,'elasticsearch','config'),
			'-Epath.data='+path.join(boot.home,'elasticsearch','data'),
			'-Epath.logs='+path.join(boot.home,'elasticsearch','logs')
		];

		process.Yolk.elasticsearch = child.spawn(process.Yolk.elasticpath,args);
	}else{
		var args = [
			'/c',
			process.Yolk.elasticpath,
			'-Epath.conf='+path.join(boot.home,'elasticsearch','config'),
			'-Epath.data='+path.join(boot.home,'elasticsearch','data'),
			'-Epath.logs='+path.join(boot.home,'elasticsearch','logs')
		];
		process.Yolk.elasticsearch = child.spawn('cmd.exe',args);
	}

	process.Yolk.elasticsearch.stdout.on('data', function(data){
		var string = (`${data}`);
		var trimmed = string.split('[yolk]')[1];
		var p = string.match(/pid\[([^\]]+)\]/);
		if(p){
			pid = p[1];
			process.Yolk.priority(pid);
		}
		if(trimmed){
			process.Yolk.storedMesssage.log = trimmed.replace(/\/n/g,'').trim();
			message('install',process.Yolk.storedMesssage);
		}
		if(string.indexOf('indices into cluster_state') > -1){
			process.Yolk.storedMesssage.log = 'The database is being audited - this could take a few minutes';
			message('install',process.Yolk.storedMesssage);
		}
		if(
			string.indexOf('[RED] to [YELLOW]') > -1 ||
			string.indexOf('[RED] to [GREEN]') > -1 ||
			string.indexOf('[YELLOW] to [GREEN]') > -1 ||
			string.indexOf('recovered [0] indices into cluster_state') > -1 //||
			//string.indexOf('[yolk] started') > -1
		){
			process.Yolk.resolver.dbReady();
		}
	});
}

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
		message('log',{log:mess.log});
		if(mess.object){
			message('log',{log:mess.object});
		}
	},
	warn:function(mess){
		if(process.env.ELECTRON_ENV !== 'development') return;
		mess = console.process(mess,"warn");
		message('log',{warn:mess.log});
		if(mess.object){
			message('log',{warn:mess.object});
		}
	},
	error:function(mess){
		if(process.env.ELECTRON_ENV !== 'development') return;
		mess = console.process(mess,"error");
		message('log',{error:mess.log});
		if(mess.object){
			message('log',{error:mess.object});
		}
	},
	say:function(mess){
		if(process.env.ELECTRON_ENV !== 'development') return;
		message('log',{log:mess});
	}
};
