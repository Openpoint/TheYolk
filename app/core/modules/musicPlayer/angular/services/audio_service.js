"use strict"

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

angular.module('yolk').factory('audio',['$timeout','$sce',function($timeout,$sce) {
	const path = require('path');
	const {ipcRenderer} = require('electron');

	let ytwin;
	const Url = require('url');
	var vidlength;
	//var vidprogress;
	var vidratio;
	var fadetimer;
	var $scope;

	Yolk.controls.commands.musicPlayer = function(command){
		if(command==='next') $scope.audio.next();
		if(command ==='play'){
			$scope.audio.play($scope.lib.playing);
		}
		if(command ==='prev' && $scope.lib.previous){
			$scope.audio.play($scope.lib.previous);
			$('#topmen .prev').addClass('dead');
		}
		if(!$scope.lib.previous) $('#topmen .prev').addClass('dead');
	}
	function fadein(){
		$timeout.cancel(fadetimer);
		$('#fullscreen_out').show();
		fadetimer = $timeout(function(){
			fadeout();
		},3000);
	};
	function fadeout(){
		$('#fullscreen_out').hide();
	};
	function topmen(){
		if($scope.lib.playing && $scope.lib.playing.state==='paused'){
			$('#topmen .playing').removeClass('playing fa fa-pause-circle-o').addClass('paused fa fa-play-circle-o');
		}else{
			$('#topmen .paused').addClass('playing fa fa-pause-circle-o').removeClass('paused fa fa-play-circle-o');
		}
	}
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
				fadetimer = $timeout(function(){
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
		this.width = 0;
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
		this.Webview();
	}

	audio.prototype.background = function(){
		var self = this;
		this.bg = true;
		ipcRenderer.sendSync('youtube_window');
		this.youtube_window = Yolk.remote('youtube_window');
		if(this.youtube_position && this.youtube_window.setPosition){
			this.youtube_window.setPosition(this.youtube_position[0],this.youtube_position[1])
		}
		
		this.youtube_window.on('close',function(){
			self.bgurl = self.youtube_window.getURL();
			self.state='paused';
			self.youtube_window.destroy();
			self.youtube_window = false;
		})
		if($scope.lib.playing&&$scope.lib.playing.youtube){
			var src = $scope.webView.src;
			this.Webview($scope.webView.src);
		}else{
			this.Webview();
		}
		if($scope.lib.playing){
			Yolk.controls.html.musicPlayer=`
			<div class='fa fa-music' onclick='window.location="#!/musicPlayer"'>
				<div>
					<div class='prev fa fa-step-backward' onclick='Yolk.controls.commands.musicPlayer("prev");event.stopPropagation();'></div>
					<div class='playing fa fa-pause-circle-o' style='font-size:2em;' onclick='Yolk.controls.commands.musicPlayer("play");event.stopPropagation();'></div>
					<div class='fa fa-step-forward' onclick='Yolk.controls.commands.musicPlayer("next");event.stopPropagation();'></div>
				</div>
			</div>
			<script style="display:none;">Yolk.controls.commands.musicPlayer()</script>		`
		}
	}

	audio.prototype.resume = function(scope){
		$scope = scope;

		var self = this;
		if(this.bg){
			this.bg = false;
			var src = this.bgurl||this.youtube_window.getURL();
			this.bgurl = false;
			if(this.youtube_window){
				this.youtube_position = this.youtube_window.getPosition()
				this.youtube_window.destroy();
			}
			this.youtube_window = false;
			$timeout(function(){
				$scope.isfullscreen = false;
				if(self.state) $scope.lib.playing.state=self.state;
				topmen();
				self.state = false;
				$scope.search.go(false,'resume');
				$scope.tracks.isInFocus();
			})
			this.Webview(src);
		}else{
			this.Webview($scope.webView.src);
			console.warn('no bg')
			$timeout(function(){
				$scope.isfullscreen = false;
				$scope.tracks.isInFocus();
			})
		}

		return this;
	}
	ipcRenderer.on('media',function(event,data){
		$scope.audio.listeners({channel:'media',args:data})
	})
	ipcRenderer.on('location',function(event,url){
		var protocol = Url.parse(url).protocol
		if (protocol === 'http:' || protocol === 'https:') {
			if($scope.isfullscreen) $scope.fullscreen();
			url = encodeURIComponent(url);
			$scope.webView.webContents.send('media','pause');
			var win = Yolk.remote('win');
			win.webContents.executeJavaScript("window.location = '#!/link?loc="+url+"';");
		}
	})
	audio.prototype.listeners = function(event){
		var self = this;
		if(event.channel === 'media'){
			switch (event.args[0]) {
				case 'ratio':
					vidratio = event.args[1];
					if(this.bg){
						this.youtube_window.setSize(600,Math.round(600*vidratio),true);
					}
					$scope.$apply(function(){
						$scope.dims.vidheight = ($scope.dims.sidebarWidth-1)*vidratio;
					})
				break;
				case 'vidready':
					$scope.lib.playing.youtube=true;
					vidlength = event.args[1];

				break;
				case 'next':
					this.next();
				break;
				case 'time':
					if(this.buffering) this.buffering = false;
					this.vidprogress = event.args[1];

				break;
				case 'play':
					this.state = 'playing';
					$scope.$apply(function(){
						$scope.lib.playing.state = 'playing';
					});
				break;
				case 'pause':
					this.state = 'paused';
					$scope.$apply(function(){
						$scope.lib.playing.state = 'paused';
						self.progress();
					});

				break;
			}
		};
	}
	audio.prototype.Webview = function(src){
		var self = this;
		if(this.bg){
			$scope.webView = this.youtube_window;
			//$scope.webView.webContents.openDevTools()
		}else{
			$scope.webView = document.querySelector('webview');

		}
		if(src){
			src = src.split('&start=')[0];
			src+='&start='+Math.floor($scope.audio.vidprogress);
		}
		var google_pid;
		if(this.bg){
			var proceed = false;
			if(src) $scope.webView.loadURL(src,{httpReferrer:'https://youtube.com'});
			$scope.webView.once('ready-to-show', () => {
				$scope.webView.show()
			})
			$scope.webView.webContents.on('dom-ready',function(){
				$scope.webView.webContents.executeJavaScript('Yolk_context("window")')
			});
			$scope.webView.webContents.on('media-started-playing',function(){
				if(proceed) $scope.lib.playing.state = 'playing';
				topmen()
				if($scope.lib.playing.state==='paused') $scope.webView.webContents.send('media','pause');
				proceed = true;
			});
			$scope.webView.webContents.on('did-start-loading',function(){
				$scope.webView.webContents.executeJavaScript('Yolk_pid()').then(function(pid){
					if(pid !== google_pid){
						Yolk.remote('priority')(pid);
					}
					google_pid = pid;
				})
			})
			return;
		}

		$scope.webView.addEventListener('did-start-loading',function(){
			 $scope.webView.executeJavaScript('Yolk_pid()',false,function(pid){
				if(pid !== google_pid){
					Yolk.remote('priority')(pid);
				}
				google_pid = pid;
			})
		});

		$scope.webView.addEventListener('ipc-message',function(event){
			self.listeners(event);
		});
		$scope.webView.addEventListener('dom-ready', function(e) {
			//$scope.webView.openDevTools();
			$scope.webView.executeJavaScript('Yolk_context("webview")');
			if(src && $scope.lib.playing && $scope.lib.playing.youtube) $scope.webView.loadURL(src,{httpReferrer:'https://youtube.com'});
			src=false;
		})
		$scope.webView.addEventListener('media-started-playing',function(){
			if($scope.lib.playing.state === 'paused') $scope.webView.send('media','pause');

		})
		$scope.webView.addEventListener('new-window', function(e){
			var protocol = Url.parse(e.url).protocol
			if (protocol === 'http:' || protocol === 'https:') {
				e.url = encodeURIComponent(e.url);
				window.location = '#!/link?loc='+e.url;
			}
		});
	}


	//Play next track
	audio.prototype.next = function(){
		if(!$scope.lib.next){
			if($scope.lib.playing.youtube){
				$scope.dims.vidheight=false;
				if(!this.bg) $scope.webView.send('media','pause');
			}else{
				this.player.pause();
			}
			$scope.lib.playing.state = false;
			topmen();
			return;
		}
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
			if($scope.isfullscreen) $scope.fullscreen();
			$scope.dims.vidheight = false;
		}

		if(this.playing !== source){
			if(init){
				$scope.tracks.albumAll = false;
				$scope.tracks.playlistAll = false;
				if($scope.drawers.lib['album']) $scope.drawers.lib['album'].playing = false;
				if($scope.playlist.active){
					$scope.tracks.playlistAll = true;
				}else if($scope.pin.Page === 'album'){
					$scope.drawers.dpos[$scope.pin.Page].filter = $scope.pin.Filter;
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

			$scope.webView.send('media','pause');

			//webView.send('media','hide');
			this.player.pause();
			this.buffering=true;
			this.error = false;
			this.playing = source;

			if($scope.lib.playing){
				$scope.lib.playing.state = false;
				$scope.lib.previous = $scope.lib.playing;
				$('#topmen .prev').removeClass('dead')
			}
			this.vidprogress = 0;
			this.progress(false,true)
			if(!$scope.lib.playing) $scope.lib.playing = {};
			$scope.lib.playing.state = false;
			$scope.db.client.get({index:$scope.db_index,type:track.type,id:track.id},function(err,data){

				if(err) console.error(err)
				if($scope.$apply.toString().indexOf('function noop')===-1){
					$scope.$apply(function(){
						go();
					})
				}else{
					go();
				}
				function go(){
					$scope.lib.playing = data._source;
					$scope.lib.playing.state = 'playing';
					topmen()
					$scope.tracks.isInFocus();

					if(track.type !== 'youtube'){
						if(self.bg) $scope.webView.hide();
						$scope.lib.playing.youtube=false;
						self.player.src = source;

					}else{
						if(self.bg) $scope.webView.show();
						$scope.dims.vidheight = $scope.dims.sidebarWidth/16*9;
						$scope.lib.playing.youtube = true;
						$scope.lib.playing.state = 'playing';
						$scope.webView.loadURL(track.path+track.file+'?autoplay=1&controls=0&color=white&disablekb=1&modestbranding=1&rel=0&showinfo=0',{httpReferrer:'https://youtube.com'});
					}
					self.progress(true);
				}
			})
			//Add playing track to the recently played playlist
			if(!$scope.playlist.active || $scope.playlist.selected !== 1){
				if($scope.tracks.source.type==='Playlist' && $scope.playlist.selected === 1) return;
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
				topmen();
				if($scope.lib.playing.youtube){
					$scope.webView.send('media','play');
				}else{
					this.player.play();
				}
				this.progress(true);
			}else{
				$scope.lib.playing.state = 'paused';
				topmen();
				self.progress()
				if($scope.lib.playing.youtube){
					$scope.webView.send('media','pause');
				}else{
					this.player.pause();
				}
			}
		}
	}

	//seek in the track
	audio.prototype.seek=function(event){

		this.vidprogress= vidlength*(event.offsetX/$scope.dims.playwindowWidth);
		if($scope.lib.playing.youtube){
			$scope.webView.send('media','seek',this.vidprogress);
		}else{
			this.player.currentTime  = this.vidprogress;
		}
		this.progress(true,false,true);
	}

	//control the progress bar
	var Progress;
	audio.prototype.progress = function(repeat,reset,seek){ //update the progress bar when playing
		$timeout.cancel(Progress)
		if(!$scope.lib.playing) return;
		var self = this;
		if(!reset && !$scope.lib.playing.youtube){
			this.vidprogress = this.player.currentTime
		}
		if(reset) this.vidprogress = 0;
		if(this.vidprogress && vidlength){
			//console.log((vidprogress/vidlength)*100 +'%')
			this.width = (this.vidprogress/vidlength)*100 +'%';
			/*
			if(seek){
				$('#playing .progress').css({
					'width':(this.vidprogress/vidlength)*100 +'%'
				});
			}else{
				this.width =
				$('#playing .progress').css({
					'width':(this.vidprogress/vidlength)*100 +'%'
				});
			}
			*/
		}else{
			//console.log('reset')
			this.width = 0;
			/*
			$('#playing .progress').css({
				'width':'0%'
			});
			*/
		}
		if($scope.lib.playing && $scope.lib.playing.state && repeat){
			Progress = $timeout(function(){
				self.progress(true);
			},1000);
		}
	}
	return audio;
}])
