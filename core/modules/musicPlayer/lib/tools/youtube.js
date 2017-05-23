var sender;
const {ipcRenderer} = require('electron');
const shell = require('electron').shell;
var video;
var remote=true;

function timer(){
	ipcRenderer.sendToHost('media','time',video.currentTime);
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
		console.log('pause')
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
