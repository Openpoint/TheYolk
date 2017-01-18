"use strict"
angular.module('yolk').factory('tracks',['$q','$filter','$timeout', function($q,$filter,$timeout) {

	var $scope;
	var body = [];
	var q = [];
	var Process;
	const tools = require('../../lib/tools/searchtools.js');
	const Q = require('promise');



	var tracks = function(scope){
		$scope = scope;
		var self = this;
		this.playlists = {};
	}

	//find the next playing track
	tracks.prototype.next = function(){
		var playing = this.playlists.default.indexOf($scope.lib.playing.id);
		var next = this.playlists.default[playing+1] ? playing+1:0;
		var id = this.playlists.default[next];
		var search = {
			index:$scope.db_index,
			type:$scope.pin.pinned.sources.toString(),
			size:1,
			body:{query:{bool:{must:[
				{match:{
					id:id
				}}
			]}}}
		}
		$scope.db.fetch(search).then(function(data){
			data.items[0].filter.pos = next;
			$scope.lib.next = data.items[0]
		},function(err){
			console.error(err);
		})
	}

	//check if the playing track is contained in the visible list and update the default playlist
	tracks.prototype.isInFocus = function(){
		var self = this;
		delete $scope.search.activesearch.from;
		delete $scope.search.activesearch.size;
		$scope.search.activesearch.body._source = "id";
		return new Q(function(resolve,reject){
			$scope.db.fetchAll($scope.search.activesearch).then(function(data){
				data = data.map(function(id){
					return id.id;
				})

				self.playlists.default = data;
				if(data.indexOf($scope.lib.playing.id) > -1){
					$scope.lib.playing.filter.pos = data.indexOf($scope.lib.playing.id);
				}else{
					$scope.lib.playing.filter.pos = -1;
					self.next();
				}
				resolve(true);
			},function(err){
				reject(err);
			})
		})
	}

	//set the padding in the playwindow
	tracks.prototype.fixChrome = function(libsize){
		if($scope.lazy.chunk > 1){
			var padding = ($scope.lazy.Top-$scope.lazy.Step)*$scope.lazy.trackHeight;
		}else{
			var padding = 0;
		}
		var height = libsize*$scope.lazy.trackHeight;
		if(height < $('#tracks').outerHeight()){
			$('#playwindow').scrollTop(0);
		}
		$('#tracks').css({paddingTop:padding});
		$('#tracks').height(height-padding);
		$('#playwindow').scrollTop($scope.pin.scroll[$scope.pin.Page]);
	}

	//delete a track
	tracks.prototype.delete = function(type,id,playing){
		if(playing){
			$scope.audio.next();
		}
		$scope.db.update({
			index:$scope.db_index,
			type:type,
			id:id,
			body:{doc:{
				deleted:"yes",
				date:Date.now()
			}}
		}).then(function(data){
			$timeout(function(){
				$scope.search.go(false,true);
			})
		},function(err){
			console.error(err);
		})
	}
	//undelete a track
	tracks.prototype.undelete = function(type,id,playing){
		if(playing){
			$scope.audio.next();
		}
		$scope.db.update({
			index:$scope.db_index,
			type:type,
			id:id,
			body:{doc:{
				deleted:"no",
				date:Date.now()
			}}
		}).then(function(data){
			$timeout(function(){
				$scope.search.go(false,true);
			})
		},function(err){
			console.error(err);
		})
	}
	/*
	//Apply pin and source filters to the active array of tracks
	tracks.prototype.Filter = function(){
		$scope.lib.tracks = $filter('tracks')($scope);
	}
	*/
	//Send database tracks to be verified against local file system
	tracks.prototype.checkLocal = function(index){
		console.log(index)
		if($scope.settings.paths.musicDir){
			var query = {
				index:$scope.db_index,
				type:[index],
			}
			$scope.db.fetchAll(query).then(function(data){
				console.log(data)
				ipcRenderer.send('verify', {
					dir:$scope.settings.paths.musicDir,
					tracks:data
				});
			})
		}
	}

	//Sync filesystem file removals to database
	tracks.prototype.verify = function(data){
		console.log('verify')
		if(data.remove.length){
			var body = [];
			data.remove.forEach(function(track){
				body.push({
					delete:{
						_index:$scope.db_index,
						 _type:'local',
						 _id:track.id
					}
				});
				$scope.lib.tracks = $scope.lib.tracks.filter(function(ltrack){
					if(ltrack.id !== track.id){
						return true;
					}
				});
			});

			$scope.db.client.bulk({
				body:body
			},function(err,data){
				console.log(data);
			})
		}
	}
	return tracks;
}])
