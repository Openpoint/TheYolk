'use strict'

angular.module('player').controller('playerController', ['$scope','$timeout','orderByFilter','elastic','lazy','internetarchive','jamendo','filters', function($scope,$timeout,orderBy,elastic,lazy,internetarchive,jamendo,filters) {

	filters.add('test',function(){
		console.log('test');
	});

	window.onbeforeunload = function(){
		ipcRenderer.send('dBase', false);
	};



	const fs = require('fs');
	const path = require('path');
	const {ipcRenderer} = require('electron');
	const {dialog} = require('electron').remote
	var allTracks=[];

	$scope.lazy = new lazy($scope); //scrolling gui functionality
	$scope.dbReady = false;
	$scope.lib = {
		tracks:[],
		size:0,
		loaded:0,
		ready:false
	};

	$scope.pinned={
		artist:false,
		album:false
	}
	$scope.nuke=function(){
		client.indices.delete({index:'local'})
	}


	//connect to the Elasticsearch database
	var client;
	elastic.connect().then(function(data){

		client = data.client;

		$scope.dbReady = true; //the database is ready

		//get settings from database or set default
		if(data.settings){
			$scope.settings = data.settings;
		}else{
			$scope.settings = require('../settings.json');
			for(var key in $scope.settings){
				client.index({
					index:'local',
					type:'settings',
					id:key,
					body:$scope.settings[key]
				});
			};
		}
		/*
		jamendo.then(function(data){
			allTracks = data;
			$scope.lib.tracks = allTracks
			$scope.lib.ready = true;
			$scope.lazy.refresh();

		});

		//internetarchive('Hungry Lucy');


		internetarchive.then(function(data){
			//console.log(data);

			allTracks = data;
			//console.log(allTracks);
			//$scope.sort('downloads');
			$scope.lib.tracks = allTracks
			$scope.lib.ready = true;
			$scope.lazy.refresh();
		});
		*/


		//set the local track listing from the database
		if(data.tracks && data.tracks.length){
			allTracks = data.tracks;
			//console.log(allTracks);
			$scope.sort('title');
			$scope.lib.ready = true;
			$scope.lazy.refresh();
			//verify against actual file system

			/*
			ipcRenderer.send('verify', {
				dir:$scope.settings.paths.musicDir,
				tracks:allTracks
			});
			* */

		}

	},function(err){
		console.log(err);
	},function(message){
		console.log(message);
	});


	var dims=function(){
		this.menHeight = 30;
		this.sidebarWidth = 300;
		this.scroller = 15;
	}
	dims.prototype.update = function(){
		this.playwindowWidth = $(window).width() - this.sidebarWidth;
		this.playwindowHeight = $(window).height() - this.menHeight;
		this.sidebarHeight = $(window).height() - this.menHeight;
	}
	$scope.dims = new dims();
	$scope.dims.update();
	$(window).resize(function(){
		$scope.dims.update();
		$timeout(function(){
			$scope.lazy.refresh();
			$('#playwindow').scrollTop($scope.dims.scrollTop);
		});

	});


	//implement listeners to main node process

	ipcRenderer.on('loaded', function(event, size){
		//$timeout(function(){
			$scope.lib.size = size;
		//});

	});

	ipcRenderer.on('track', function(event,loaded){
		//console.log('track');
		$scope.lib.ready = false;
		client.create({
			index:'local',
			type:'tracks',
			id:loaded[1].id,
			body:loaded[1]
		},function(err,data){
			//console.log(err);
			//console.log(data);
		});
		allTracks.push(loaded[1]);
		//console.log(allTracks.length+' : '+$scope.lib.size);
		if(allTracks.length === $scope.lib.size){

			$scope.sort('title');
			$scope.lib.ready = true;
			$scope.lazy.refresh();
		}
		$timeout(function(){
			$scope.lib.loaded = loaded[0];
		});
	});

	ipcRenderer.on('MBtrack', function(event, track, filter){

		if(!filter || filters[filter.funct](filter.value,track.metadata.artist)){
			console.log(track.metadata.artist);
			$scope.lib.ready = true;
			allTracks.push(track);
			$timeout(function(){
				$scope.lib.tracks= allTracks
			});
		}else{
			console.log('no match');
		}

	});

	ipcRenderer.on('verify', function(event, data){
		console.log(data);
		if(data.remove.length){
			data.remove.forEach(function(track){
				var index = allTracks.map(function(e) {
					return e.id;
				}).indexOf(track.id);

				//console.log(allTracks[index].metadata.title);
				allTracks.splice(index,1);
				client.delete({
					index:'local',
					type:'tracks',
					id:track.id
				})
			});
			$scope.sort('title');
			$scope.lazy.refresh();
		}
	});

	ipcRenderer.on('log', function(event, data){
		console.log(data);

	});

	//create the audio player object
	var audio = new Audio();

	//listen for track ended and play next
	audio.addEventListener('ended', function(){
		var index = $scope.lib.tracks.indexOf($scope.lib.playing);
		$scope.play(index+1);
	});

	//control the progress bar
	var Progress;
	var progress = function(repeat,clear){ //update the progress bar when playing

		if(clear){
			$('.track.playing .progress').css({
				'width':0
			});
		}

		$('.track.playing .progress').css({
			'width':(audio.currentTime/audio.duration)*100 +'%'
		});



		if($scope.lib.playing && $scope.lib.playing.state && repeat){
			Progress = setTimeout(function(){
				progress(true);
			},2000);
		}
	}

	//set the local music library location and scan files
	$scope.fileSelect= function(){
		dialog.showOpenDialog({properties: ['openDirectory']},function(Dir){
			$scope.settings.paths.musicDir = Dir[0];

			client.update({
				index:'local',
				type:'settings',
				id:'paths',
				body:{
					doc:{
						musicDir:Dir[0]
					}
				}
			});
			ipcRenderer.send('getDir', Dir[0]);
			$scope.$apply();
		})
	}

	//sort the track list by title, artist or album
	$scope.sort = function(sort){
		if(!$scope.pinned.artist && !$scope.pinned.album){
			allTracks  = orderBy(allTracks, 'metadata.'+sort);
			$scope.lib.tracks = allTracks;
		}else{
			$scope.lib.tracks = orderBy($scope.lib.tracks, 'metadata.'+sort)
		}

		$scope.lazy.refresh();


	}

	//pin (filter) the tracklist by artist or album
	$scope.pin=function(type,name){

		if(type === 'artist'){
			$scope.pinned.album = false;
		}else{
			$scope.pinned.artist = false;
		}
		if(!$scope.pinned[type] || $scope.pinned[type] != name){
			if(!$scope.pinned.scrollTop){
				$scope.pinned.scrollTop = $('#playwindow').scrollTop();
			}
			$scope.pinned[type] = name;
			$scope.lib.tracks = allTracks.filter(function (el) {
				return el.metadata[type] === name
			});
			$scope.lazy.refresh();


		}else{
			$scope.pinned[type] = false;
			$scope.lib.tracks = allTracks;
			$scope.lazy.refresh($scope.pinned.scrollTop);

			$scope.pinned.scrollTop = false;
		}
	}

	//play or pause a track
	$scope.play = function(index){
		if(!$scope.lib.playing || index !== $scope.lib.playing.index){
			//console.log('playing new song');
			if($scope.lib.playing && $scope.spacer){
				$('#playwindow').scrollTop($('#playwindow').scrollTop()-$scope.lazy.playingHeight);
			}
			//$timeout(function(){
				if($scope.lib.playing){
					$scope.lib.playing.state=false;
				}
				$scope.lib.playing = $scope.lib.tracks[index];
				var src=path.join($scope.lib.playing.path,$scope.lib.playing.file);
				src = src.replace('#','%23');
				if(!$scope.lib.playing){
					$scope.lib.playing = $scope.lib.tracks[0];
				}
				$scope.lib.playing.state='playing';
				$scope.lib.playing.index = index
				audio.src=src;
				audio.play();

				$scope.lib.playing.ani = false;
				clearTimeout(Progress);
				progress(true,true);
				$timeout(function(){
					$scope.lib.playing.ani = true;
				},2000);

			//});
			$timeout(function(){
				$scope.lazy.getPos();
			});
		}else if($scope.lib.playing.state==='playing'){
			//console.log('pausing song');
			$scope.lib.playing.state='paused';
			audio.pause();
		}else if($scope.lib.playing.state==='paused'){
			//console.log('unpausing song');
			$scope.lib.playing.state='playing';
			audio.play();
		}

	}

	//seek in the track
	$scope.seek=function(event){

		$scope.lib.playing.ani = false;
		audio.currentTime = audio.duration*(event.offsetX/$(event.target).width());
		progress();


		$timeout(function(){
			$scope.lib.playing.ani = true;
		},1000);
	}



}])
