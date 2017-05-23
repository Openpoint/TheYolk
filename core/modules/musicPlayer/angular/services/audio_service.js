angular.module('yolk').factory('audio',['$timeout','$sce',function($timeout,$sce) {
	const path = require('path');
	const {ipcRenderer} = require('electron');
	var vidlength;
	var vidprogress;
	var vidratio;
	var fadetimer;
	var $scope;

	var webView = document.getElementById('youtube');

	webView.addEventListener('dom-ready', function(e) {
		webView.openDevTools();
	})
	webView.addEventListener('ipc-message',function(event){
		if(event.channel === 'media'){
			switch (event.args[0]) {
				case 'ratio':
					vidratio = event.args[1];
					$timeout(function(){
						$scope.dims.vidheight = $scope.dims.sidebarWidth*vidratio;
					})
				break;
				case 'vidready':
					$scope.lib.playing.youtube=true;
					vidlength = event.args[1];

				break;
				case 'next':
					self.next();
				break;
				case 'time':
					if($scope.audio.buffering) $scope.audio.buffering = false;
					vidprogress = event.args[1];
				break;
				case 'play':
					$scope.lib.playing.state = 'playing';
					$scope.$apply();
				break;
				case 'pause':
					$scope.lib.playing.state = 'paused';
					$scope.lib.playing.ani = false;
					$scope.$apply();
					clearTimeout(Progress);
				break;
			}
		};
	});

	function fadein(){
		clearTimeout(fadetimer);
		$('#fullscreen_out').show();
		fadetimer = setTimeout(function(){
			fadeout();
		},3000);
	};
	function fadeout(){
		$('#fullscreen_out').hide();
	};

	//create the audio player object
	var audio = function(scope){
		$scope = scope;
		$scope.fader=function(){
			if($scope.isfullscreen){
				fadein();
			}
		}
		$scope.fullscreen = function(){

			if (!document.webkitFullscreenElement){
				document.getElementById("youtube2").webkitRequestFullscreen();
				$('#youtube2').addClass('fullscreen').removeClass('small');
				$scope.isfullscreen = true;
				fadetimer = setTimeout(function(){
					fadeout();
				},3000);
			}else{
				document.webkitExitFullscreen();
				$('#youtube2').removeClass('fullscreen').addClass('small');
				$scope.isfullscreen = false;
				fadein();
			}

		}
		var self = this;
		this.player = new Audio();
		this.player.preload = 'auto';
		this.player.addEventListener('ended', function(){
			self.next();
		});
		this.player.addEventListener('canplay', function(){
			$timeout(function(){
				self.buffering=false;
				if($scope.lib.playing.state !== 'paused'){
					self.player.play();
					vidlength = self.player.duration
				}
			})
		});
		this.player.addEventListener('error', function(){
			$timeout(function(){
				self.error = true;
			})
		});
		this.playing = null;
	}
	//Play next track
	audio.prototype.next = function(){
		this.play($scope.lib.next);
	}


	//Play a track
	audio.prototype.play = function(track){
		var self = this;

		if(track.type === 'local'){
			var source = path.join(track.path,track.file)
		}
		if(track.type === 'jamendo' || track.type === 'internetarchive'){
			var source = track.file;
		}
		if(track.type === 'youtube'){
			var source = track.path+track.file;
		}
		if(track.type !== 'youtube'){
			$timeout(function(){
				$scope.dims.vidheight = false;
			})
		}

		if(this.playing !== source){

			webView.send('media','pause');
			webView.send('media','hide');
			this.player.pause();
			this.buffering=true;
			this.error = false;

			this.playing = source;
			if($scope.lib.playing){
				$scope.lib.playing.state = false;
				$scope.lib.playing.ani = false;
				$scope.lib.previous = $scope.lib.playing;
			}
			vidprogress = 0;
			clearTimeout(Progress);
			$scope.lib.playing = track;

			//Add playing track to the recently played playlist
			if(!$scope.playlist.active || $scope.playlist.selected !== 1){
				$scope.playlist.renew[1]=true;
				$scope.db.client.update({index:$scope.db_index,type:track.type,id:track.id,refresh:true,body:{doc:{played:Date.now()}}}, function (error, response){
					if(error) console.error(error);
					var pos = -1;
					$scope.playlist.activelist[1].some(function(t,index){
						if (t.id === track.id){
							pos = index;
							return true;
						}
					})
					if(pos === -1){
						$scope.playlist.activelist[1].unshift({id:track.id,type:track.type});
					}else{
						$scope.playlist.activelist[1].splice(pos, 1);
						$scope.playlist.activelist[1].unshift({id:track.id,type:track.type});
					}
					$scope.playlist.updatePlaylist(1,$scope.playlist.activelist[1]);
				})
			}
			$scope.lib.devinfo=JSON.stringify(track, null, 4)
			$scope.lib.playing.state = 'playing';
			$scope.tracks.isInFocus();

			if(track.type !== 'youtube'){
				$scope.lib.playing.youtube=false;
				this.player.src = source;
			}else{
				$timeout(function(){
					$scope.dims.vidheight = $scope.dims.sidebarWidth/16*9;
					$scope.lib.playing.embed = $sce.trustAsResourceUrl(track.path+track.file+'?autoplay=1&controls=0&color=white&disablekb=1&modestbranding=1&rel=0&showinfo=0');
				})
				$scope.lib.playing.youtube = true;
				$scope.lib.playing.state = 'playing';

			}
			this.progress(true,true);

			$timeout(function(){
				$scope.lib.playing.ani = true;
			},2000);
		}else{

			if($scope.lib.playing.state === 'paused'){
				$scope.lib.playing.state = 'playing';

				if($scope.lib.playing.youtube){
					webView.send('media','play');
				}else{
					this.player.play();
				}

				$scope.lib.playing.ani = true;
				this.progress(true);
			}else{

				$scope.lib.playing.state = 'paused';
				$scope.lib.playing.ani = false;
				clearTimeout(Progress);
				if($scope.lib.playing.youtube){
					webView.send('media','pause');
				}else{
					this.player.pause();
				}
			}
		}
		//$scope.lazy.refresh($('#playwindow').scrollTop())
	}

	//seek in the track
	audio.prototype.seek=function(event){
		clearTimeout(Progress);
		$scope.lib.playing.ani = false;
		vidprogress= vidlength*(event.offsetX/$scope.dims.playwindowWidth);
		if($scope.lib.playing.youtube){
			webView.send('media','seek',vidprogress);
		}else{
			this.player.currentTime  = vidprogress;
		}
		this.progress(true);
		$timeout(function(){
			$scope.lib.playing.ani = true;
		},10);
	}

	//control the progress bar
	var Progress;
	audio.prototype.progress = function(repeat,reset){ //update the progress bar when playing

		var self = this;
		if(reset){
			$('#playing .progress').css({
				'width':0
			});
		}
		if(!$scope.lib.playing.youtube){
			vidprogress = this.player.currentTime
			vidlength = this.player.duration;
			if (this.player.readyState === 4){
				//console.log(vidlength)
				//console.log(this.player.buffered.start(this.player.buffered.length-1))
				//console.log(this.player.seekable.end(this.player.seekable.length-1))
			}
		}

		$('#playing .progress').css({
			'width':(vidprogress/vidlength)*100 +'%'
		});



		if($scope.lib.playing && $scope.lib.playing.state && repeat){
			Progress = setTimeout(function(){
				self.progress(true);
			},2000);
		}
	}
	return audio;
}])
