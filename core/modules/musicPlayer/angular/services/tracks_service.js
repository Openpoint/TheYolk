"use strict"
angular.module('yolk').factory('tracks',[function(){

	var $scope;
	const tools = require('../../lib/tools/searchtools.js');

	var tracks = function(scope){
		$scope = scope;
		this.source={
			type:false,
			name:false,
		}
	}
	function getAll(playlist,up){
		//if(album && !$scope.playlist.active) return $scope.tracks.all;
		if($scope.tracks.playlistAll || playlist){
			if(!playlist){
				$scope.tracks.source.type='Playlist';
				$scope.tracks.source.name = $scope.playlist.options.filter(function(op){
					return op.id === $scope.playlist.selected
				})[0].name;
				$scope.tracks.source.id = $scope.playlist.selected
			}
			return $scope.playlist.activelist[$scope.playlist.selected];
		}
		if($scope.tracks.albumAll){
			$scope.tracks.source.type = 'Album';
			$scope.tracks.source.name = $scope.drawers.lib['album'][$scope.drawers.lib['album'].playing].title;
			$scope.tracks.source.id = $scope.drawers.lib['album'][$scope.drawers.lib['album'].playing].id;
			return $scope.tracks.albumAll;
		}
		$scope.tracks.source.type= false;
		$scope.tracks.source.name= false;
		$scope.tracks.source.id= false;
		return $scope.search.memory.Title;
	}
	//find the next playing track
	tracks.prototype.next = function(){
		if(!$scope.lib.playing) return;
		var all = getAll(false,true);
		if(!all||!all.length){
			$scope.lib.next = false;
			return;
		}
		var index = all.indexOf($scope.lib.playing.id);
		var next = all[index+1] ? index+1:0;
		var id = all[next];
		var search = {index:$scope.db_index,type:$scope.pin.pinned.sources.toString(),size:1,body:{query:{bool:{must:[
				{match:{id:id}}
		]}}}}
		if(id) $scope.db.fetch(search).then(function(data){
			data.items[0].filter.pos = next;
			$scope.$apply(function(){
				$scope.lib.next = data.items[0];
			})
		},function(err){
			console.error(err);
		})
	}

	//check if the playing track is contained in the active list
	tracks.prototype.isInFocus = function(){

		if(!$scope.lib.playing) return;
		var self = this;
		var all = getAll($scope.playlist.active);
		($scope.tracks.source.type==='Album'||($scope.tracks.source.type==='Playlist'&&!$scope.playlist.active))?$scope.tracks.nofocus = true:$scope.tracks.nofocus = false;
		var index = -1;
		if(all) index = all.indexOf($scope.lib.playing.id);
		$scope.lazy.getPos(index);
		self.next();
	}


	//check if artist has remaining tracks and delete if not
	tracks.prototype.deleteArtist = function(artist){
		var must = $scope.tools.wrap.bool([{must:[
			{match:{deleted:{query:'no',type:'phrase'}}},
			{match:{artist:{query:artist,type:'phrase'}}}
		]}])
		$scope.db.client.search({index:$scope.db_index,type:'youtube,local,internetarchive',body:{query:must}},function(err,data){
			if(!data.hits.total){
				$scope.db.client.update({index:$scope.db_index,type:'artist',id:artist,refresh:true,body:{doc:{deleted:'yes'}}},function(err,data){
					if(err) console.err(err);
					$scope.search.go(true,'track and artist deleted',artist);
				})
			}
		})
	}
	//delete a track
	tracks.prototype.delete = function(track,playing,bulk){
		if(playing) $scope.audio.next();

		if($scope.playlist.active){
			$scope.playlist.remove(track.id)
			return;
		}
		var id = track.id;
		var type = track.type;
		var self = this;

		if(bulk && (type === 'album'||type==='artist')){
			if(type==='album'){
				var query = $scope.tools.wrap.bool([{must:[
					{match:{album:{query:id,type:'phrase'}}},
					{match:{deleted:{query:'no',type:'phrase'}}}
				]}]);
				var types='local,youtube,internetarchive'
			}
			if(type==='artist'){
				var query = $scope.tools.wrap.bool([{must:[
					{match:{artist:{query:id,type:'phrase'}}},
					{match:{deleted:{query:'no',type:'phrase'}}}
				]}])
				var types='local,youtube,internetarchive,album'
			}

			$scope.db.fetchAll({index:$scope.db_index,type:types,body:{query:query}}).then(function(data){
				if(!data.length) return;
				var bulk=[];
				var artists = []
				data.forEach(function(track){
					bulk.push({update:{_index:$scope.db_index,_type:track.type,_id:track.id}});
					bulk.push({doc:{deleted:'yes',bulk:'yes'}});
					if(type === 'album' && artists.indexOf(track.artist)===-1) artists.push(track.artist)
				})
				$scope.db.client.bulk({body:bulk,refresh:true},function(err,data){
					if(err) console.error(err)
					if(type === 'album' && artists.length){
						artists.forEach(function(artist){
							self.deleteArtist(artist);
						})
					}
					$scope.search.go(true,'artist or album deleted');

				})
			},function(err){
				console.error(err)
			})
		}

		if($scope.drawers.lib['album'] && track.type==="album" && track.id === $scope.drawers.lib['album'].playing) $scope.drawers.dpos.album.filter = 'deleted';
		$scope.db.update({
			index:$scope.db_index,
			type:type,
			id:id,
			body:{doc:{
				deleted:"yes",
				date:Date.now()
			}}
		}).then(function(data){
			if(type!=='artist'&&type!=='album'){
				self.deleteArtist(track.artist);
			}
			$scope.search.go(true,'track deleted');
		},function(err){
			console.error(err);
		})
	}
	//undelete a track
	tracks.prototype.undelete = function(track,playing,bulk){
		if(track.name) track.type = 'artist'
		if(!track.type) track.type = 'album'

		if(track.type !== 'artist' && track.type !== 'album'){
			$scope.db.update({
				index:$scope.db_index,
				type:'artist',
				id:track.artist,
				body:{doc:{
					deleted:"no",
					bulk:'no',
				}}
			}).then(function(data){

			},function(err){
				console.error(err);
			})
			if(track.type !== 'youtube')$scope.db.update({
				index:$scope.db_index,
				type:'album',
				id:track.album,
				body:{doc:{
					deleted:"no",
					bulk:'no',
				}}
			}).then(function(data){

			},function(err){
				console.error(err);
			})
		}

		if(bulk && (track.type === 'album'||track.type === 'artist')){
			if(track.type === 'album') var query = $scope.tools.wrap.bool([{must:[
				{match:{album:{query:track.id,type:'phrase'}}},
				{match:{bulk:{query:'yes',type:'phrase'}}}
			]}])
			if(track.type === 'artist') var query = $scope.tools.wrap.bool([{must:[
				{match:{artist:{query:track.id,type:'phrase'}}},
				{match:{bulk:{query:'yes',type:'phrase'}}}
			]}])
			$scope.db.fetchAll({index:$scope.db_index,type:'local,youtube,internetarchive',body:{query:query}}).then(function(data){
				if(!data.length) return;
				var bulk=[]
				var artist = [];
				data.forEach(function(track){

					bulk.push({update:{_index:$scope.db_index,_type:track.type,_id:track.id}});
					bulk.push({doc:{deleted:'no',bulk:'no'}});
					if(artist.indexOf(track.artist)===-1){
						artist.push(track.artist);
						bulk.push({update:{_index:$scope.db_index,_type:'artist',_id:track.artist}});
						bulk.push({doc:{deleted:'no',bulk:'no'}});
					}

				})
				$scope.db.client.bulk({body:bulk,refresh:true},function(err,data){
					//console.log(data)
				})
			},function(err){
				console.error(err)
			})
		}
		if($scope.drawers.lib['album'] && track.type==='album' && track.id === $scope.drawers.lib['album'].playing) $scope.drawers.dpos.album.filter = false;
		$scope.db.update({
			index:$scope.db_index,
			type:track.type,
			id:track.id,
			body:{doc:{
				deleted:"no",
				bulk:'no',
				date:Date.now()
			}}
		}).then(function(data){
			$scope.search.go(true,'track undeleted');
		},function(err){
			console.error(err);
		})
	}
	//Send database tracks to be verified against local file system
	tracks.prototype.checkLocal = function(index){
		console.log(index)
		if($scope.settings.paths.musicDir){
			var query = {
				index:$scope.db_index,
				type:[index],
			}
			console.log('checklocal')
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
