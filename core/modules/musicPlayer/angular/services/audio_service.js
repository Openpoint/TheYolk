angular.module('yolk').factory('audio',['$sce',function($sce) {
	const path = require('path');
	const {ipcRenderer} = require('electron');
	var vidlength;
	var vidprogress;
	var vidratio;
	var fadetimer;
	var $scope;

	var webView;

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

	//create the audio player objects
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
				$scope.$apply(function(){
					self.buffering=false;
				})
				if($scope.lib.playing.state !== 'paused'){
					self.player.play();
					vidlength = self.player.duration
				}
		});
		this.player.addEventListener('error', function(){
			$scope.$apply(function(){
				self.error = true;
			})
		});
		this.playing = null;

		webView = document.querySelector('webview');


		webView.addEventListener('dom-ready', function(e) {
			//webView.openDevTools();
		})

		webView.addEventListener('ipc-message',function(event){
			if(event.channel === 'media'){
				switch (event.args[0]) {
					case 'ratio':
						vidratio = event.args[1];
						$scope.$apply(function(){
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
						$scope.$apply(function(){
							$scope.lib.playing.state = 'playing';
						});
					break;
					case 'pause':

						$scope.$apply(function(){
							$scope.lib.playing.state = 'paused';
							self.progress();
						});

					break;
				}
			};
		});
	}
	//Play next track
	audio.prototype.next = function(){
		this.play($scope.lib.next);
	}


	//Play a track
	audio.prototype.play = function(track,init){
		var self = this;

		if(track.type === 'local'){
			var source = path.join(track.path,track.file)
		}
		if(track.type === 'internetarchive'){
			var source = track.file;
		}
		if(track.type === 'youtube'){
			var source = track.path+track.file;
		}
		if(track.type !== 'youtube'){
			//$scope.$apply(function(){
				$scope.dims.vidheight = false;
			//})
		}

		if(this.playing !== source){
			if(init){
				$scope.tracks.albumAll = false;
				$scope.tracks.playlistAll = false;
				if($scope.drawers.lib['album']) $scope.drawers.lib['album'].playing = false;
				if($scope.playlist.active){
					$scope.tracks.playlistAll = true;
				}else if($scope.pin.Page === 'album'){
					var dr = $scope.drawers.lib['album'][$scope.drawers.dpos[$scope.pin.Page].open];
					$scope.drawers.lib['album'].playing = $scope.drawers.dpos[$scope.pin.Page].open;
					$scope.tracks.albumAll=[];
					dr.discs.forEach(function(disc){
						disc.forEach(function(track){
							if(dr.tracks[track.id]) $scope.tracks.albumAll.push(dr.tracks[track.id].id)
						})
					})
				}
			}
			webView.send('media','pause');
			//webView.send('media','hide');
			this.player.pause();
			this.buffering=true;
			this.error = false;
			this.playing = source;

			if($scope.lib.playing){
				$scope.lib.playing.state = false;
				$scope.lib.previous = $scope.lib.playing;
			}
			vidprogress = 0;
			this.progress(false,true)
			$scope.db.client.get({index:$scope.db_index,type:track.type,id:track.id},function(err,data){
				if(err) console.error(err)
				$scope.lib.playing = data._source;
				$scope.lib.playing.state = 'playing';
				$scope.tracks.isInFocus();

				if(track.type !== 'youtube'){
					$scope.lib.playing.youtube=false;
					self.player.src = source;
				}else{
					$scope.dims.vidheight = $scope.dims.sidebarWidth/16*9;
					webView.loadURL(track.path+track.file+'?autoplay=1&controls=0&color=white&disablekb=1&modestbranding=1&rel=0&showinfo=0',{httpReferrer:'https:youtube.com'});
					$scope.lib.playing.youtube = true;
					$scope.lib.playing.state = 'playing';
				}
				self.progress(true);
			})
			//Add playing track to the recently played playlist
			if(!$scope.playlist.active || $scope.playlist.selected !== 1){
				var i = $scope.playlist.activelist[1].indexOf(track.id)
				if(i!==-1){
					$scope.playlist.activelist[1].splice(i,1);
				}
				$scope.playlist.activelist[1].unshift(track.id)
				$scope.playlist.updatePlaylist(1,$scope.playlist.activelist[1]);
			}

		}else{

			if($scope.lib.playing.state === 'paused'){
				$scope.lib.playing.state = 'playing';

				if($scope.lib.playing.youtube){
					webView.send('media','play');
				}else{
					this.player.play();
				}
				this.progress(true);
			}else{

				$scope.lib.playing.state = 'paused';
				self.progress()
				if($scope.lib.playing.youtube){
					webView.send('media','pause');
				}else{
					this.player.pause();
				}
			}
		}
	}

	//seek in the track
	audio.prototype.seek=function(event){

		vidprogress= vidlength*(event.offsetX/$scope.dims.playwindowWidth);
		if($scope.lib.playing.youtube){
			webView.send('media','seek',vidprogress);
		}else{
			this.player.currentTime  = vidprogress;
		}
		this.progress(true,false,true);
	}

	//control the progress bar
	var Progress;
	audio.prototype.progress = function(repeat,reset,seek){ //update the progress bar when playing
		clearTimeout(Progress)
		var self = this;


		if(!reset && !$scope.lib.playing.youtube){
			vidprogress = this.player.currentTime
		}
		if(reset) vidprogress = 0;
		if(vidprogress && vidlength){
			//console.log((vidprogress/vidlength)*100 +'%')
			if(seek){
				$('#playing .progress').css({
					'width':(vidprogress/vidlength)*100 +'%'
				});
			}else{
				$('#playing .progress').css({
					'width':(vidprogress/vidlength)*100 +'%'
				});
			}
		}else{
			//console.log('reset')
			$('#playing .progress').css({
				'width':'0%'
			});
		}
		if($scope.lib.playing && $scope.lib.playing.state && repeat){
			Progress = setTimeout(function(){
				self.progress(true);
			},1000);
		}
	}
	return audio;
}])
