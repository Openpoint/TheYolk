angular.module('yolk').factory('audio',['$timeout','$sce',function($timeout,$sce) {
	const path = require('path');
	const {ipcRenderer} = require('electron');
	var webView;
	var vidlength;
	var vidprogress;
	var vidratio;
	
	var fadetimer;
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

		
	var $scope;
	
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
				$scope.isfullscreen = true;
				fadetimer = setTimeout(function(){
					fadeout();
				},3000);
			}else{
				document.webkitExitFullscreen();
				$scope.isfullscreen = false;
				fadein();
			}
			
		}
		var self = this;
		this.player = new Audio();
		this.player.addEventListener('ended', function(){
			self.next();
		});
		this.playing = null;
	}
	//Play next track
	audio.prototype.next = function(){
		/*
		var index = $scope.lib.tracks.indexOf($scope.lib.playing);

		if((index > -1) && $scope.lib.tracks[index+1]){
			this.play($scope.lib.tracks[index+1]);	
		}else{
			this.play($scope.lib.tracks[0]);
		}
		* */
		this.play($scope.nowTracks[$scope.lib.playing.filter.pos+1] || $scope.nowTracks[0]);
			
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
		if(this.playing !== source){
			this.playing = source;
			
			if($scope.lib.playing){
				$scope.lib.playing.state = false;
				$scope.lib.playing.ani = false;				
			}

			vidprogress = 0;
			
			clearTimeout(Progress);	
					
			$scope.lib.playing = track;
			$scope.lib.devinfo=JSON.stringify(track, null, 4)
			$scope.lib.playing.state = 'playing';			
			
			if(track.type !== 'youtube'){
				$scope.lib.playing.youtube=false;
				$scope.lib.playing.embed = false;
				webView = false;
				
				self.player.pause();					
				this.player.src = source;
				this.player.addEventListener('canplay', function(){
					self.player.play();	
					vidlength = self.player.duration
				});			

								
							
			}else{
				$scope.lib.playing.youtube = true;
				$scope.lib.playing.embed = $sce.trustAsResourceUrl(track.path+track.file+'?autoplay=1&controls=0&color=white&disablekb=1&modestbranding=1&rel=0&showinfo=0');				
				this.player.pause();
				$scope.lib.playing.state = 'playing';
				$timeout(function(){
					webView = document.getElementById('youtube');									
					webView.addEventListener('dom-ready', function(e) {
						//webView.openDevTools();
					})
					webView.addEventListener('ipc-message',function(event){
						if(event.channel === 'media'){
							switch (event.args[0]) {
								case 'ratio':
									vidratio = event.args[1];
									$scope.dims.vidheight = $scope.dims.sidebarWidth*vidratio;
									$scope.$apply();
								break;
								case 'vidready':
									$scope.lib.playing.youtube=true;
									vidlength = event.args[1];
																
								break;
								case 'next':
									self.next();
								break;
								case 'time':
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
				});

			}

			$scope.lazy.refresh($('#playwindow').scrollTop());			
			this.progress(true,true);
			$timeout(function(){
				$scope.lib.playing.ani = true;
			},2000);	
		}else if(track.type !== 'youtube' || $scope.lib.playing.youtube){
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
	}

	//seek in the track
	audio.prototype.seek=function(event){
		clearTimeout(Progress);
		$scope.lib.playing.ani = false;
		vidprogress= vidlength*(event.offsetX/$(event.target).width());
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
			vidlength = this.player.duration			
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
