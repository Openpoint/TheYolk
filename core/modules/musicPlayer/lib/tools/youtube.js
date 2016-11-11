var sender;
const {ipcRenderer} = require('electron');
var video;
var remote=true;

function timer(){
	ipcRenderer.sendToHost('media','time',video.currentTime);
	setTimeout(function(){
		timer();
	},1000);
}

window.addEventListener("load",function(){	
	window.$ = window.jQuery = require('jquery');
	video = $('video')[0];	
	video.addEventListener('loadedmetadata', function(){
		var ratio = video.videoHeight/video.videoWidth;
		ipcRenderer.sendToHost('media','ratio',ratio);
	});	
	video.addEventListener('canplay', function(){
		
		ipcRenderer.sendToHost('media','vidready',video.duration);
		remote=false;
	});	
	video.addEventListener('ended', function(){
		ipcRenderer.sendToHost('media','next');
	});
	video.addEventListener('pause', function(){
		if(!remote){
			ipcRenderer.sendToHost('media','pause');
		}		
	});
	video.addEventListener('play', function(){
		if(!remote){
			ipcRenderer.sendToHost('media','play');
		}
	});
	timer();
});
ipcRenderer.on('media',function(send,mess,time){
	switch (mess){
		case 'pause':
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
		
	}
});
