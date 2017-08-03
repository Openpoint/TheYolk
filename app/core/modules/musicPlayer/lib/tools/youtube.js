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

var sender;
const {ipcRenderer} = require('electron');
const shell = require('electron').shell;
var video;
var remote=true;
var send;
var c;
window.Yolk_context = function(ct){
	c = ct;
	if(c==='webview'){
		send = ipcRenderer.sendToHost;
	}else{
		send = require('electron').remote.process.Yolk.win.send;
	}
}
function timer(){
	c==='webview'?send('media','time',video.currentTime):send('media',['time',video.currentTime]);
	setTimeout(function(){
		timer();
	},1000);
}
document.addEventListener("DOMContentLoaded",function(){
	window.$ = window.jQuery = require('jquery');
	//$('body').hide()
})
window.addEventListener("load",function(){

	//$($('video').parent().parent()).children().not($('video').parent()).hide()
	//$('body').show()
	video = $('video')[0];
	if(!video) return;
	video.addEventListener('loadedmetadata', function(){
		var ratio = video.videoHeight/video.videoWidth;
		c==='webview'?send('media','ratio',ratio):send('media',['ratio',ratio]);
	});
	video.addEventListener('canplay', function(){
		c==='webview'?send('media','vidready',video.duration):send('media',['vidready',video.duration]);
		remote=false;
	});
	video.addEventListener('ended', function(){
		c==='webview'?send('media','next'):send('media',['next']);
	});
	video.addEventListener('pause', function(){
		if(!remote){
			c==='webview'?send('media','pause'):send('media',['pause']);
		}
	});
	video.addEventListener('play', function(){
		if(!remote){
			c==='webview'?send('media','play'):send('media',['play']);
		}
	});
	timer();
});
ipcRenderer.on('media',function(send,mess,time){
	if(!video) return;
	switch (mess){
		case 'pause':
			console.log('pause');
			remote=true;
			video.pause();
			setTimeout(function(){
				remote=false;
			});
		break;
		case 'play':
			remote=true;
			video.play();
			setTimeout(function(){
				remote=false;
			});
		break;
		case 'seek':
			video.currentTime = time;
		break;
		case 'hide':
			$('body').hide()
		break;
	}
});
