"use strict"
angular.module('yolk').factory('tracks',['$q','$filter', function($q,$filter) {

	var $scope;
	var body = [];
	var q = [];
	var Process;
	const tools = require('../../lib/tools/searchtools.js');
	const Q = require("bluebird");



	var tracks = function(scope){
		$scope = scope;
		var self = this;
	}

	//find the next playing track
	tracks.prototype.next = function(index){

		if(!$scope.lib.playing) return;
		if($scope.playlist.active){
			var all = $scope.playlist.activelist[$scope.playlist.selected].map(function(item){
				return item.id;
			})
		}else{
			all = this.all;
		}
		if(!all.length){
			$scope.lib.next = false;
			return;
		}
		var next = all[index+1] ? index+1:0;
		var id = all[next];
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
		if(id) $scope.db.fetch(search).then(function(data){
			data.items[0].filter.pos = next;
			$scope.$apply(function(){
				$scope.lib.next = data.items[0]
			})

		},function(err){
			console.error(err);
		})
	}

	//check if the playing track is contained in the visible list
	tracks.prototype.isInFocus = function(){
		if(!$scope.lib.playing) return;
		var self = this;
		if($scope.playlist.active){
			var all = $scope.playlist.activelist[$scope.playlist.selected].map(function(item,index){
				return item.id;
			})
		}else{
			all = this.all;
		}
		var index = all.indexOf($scope.lib.playing.id);
		$scope.lazy.getPos(index);
		self.next(index);
	}

	//set the padding in the playwindow
	tracks.prototype.fixChrome = function(){
		if($scope.lazy.chunk > 1){
			var padding = ($scope.lazy.Top-$scope.lazy.Step)*$scope.lazy.trackHeight;
		}else{
			var padding = 0;
		}
		var height = $scope.lib.size*$scope.lazy.trackHeight;
		if($scope.lazy.drawer && $scope.lazy.drawer.active === $scope.pin.Page){
			height = height+$scope.lazy.drawer.height;
			if($scope.lazy.drawer.chunk+1 < $scope.lazy.chunk) padding = padding+$scope.lazy.drawer.height;
		}

		//if($scope.lazy.drawer && $scope.lazy.drawer.chunk === $scope.lazy.chunk) height = height+$scope.lazy.drawer.height
		$('#tracks').css({paddingTop:padding});
		$('#tracks').height(height-padding);
	}
	//check if artist has remaining tracks and delete if not
	tracks.prototype.deleteArtist = function(artist){
		var must = $scope.tools.wrap.bool([{must:[
			{match:{deleted:{query:'no',type:'phrase'}}},
			{match:{artist:{query:artist,type:'phrase'}}}
		]}])
		$scope.db.client.search({index:$scope.db_index,type:'youtube,local,internetarchive',body:{query:must}},function(err,data){
			if(!data.hits.total){
				$scope.db.client.update({index:$scope.db_index,type:'artist',id:artist,body:{doc:{deleted:'yes'}}},function(err,data){
					console.log(err)
					console.log(data)
				})
			}
		})
	}
	//delete a track
	tracks.prototype.delete = function(track,playing,bulk){
		if($scope.playlist.active){
			$scope.playlist.remove(track.id)
			return;
		}
		var id = track.id;
		if(track.name) var type = 'artist';

		if(!track.type && !type){
			var type = 'album'
		}else if(!type){
			var type = track.type;
		}
		var self = this;
		this.refreshDrawers();
		if(playing){
			$scope.audio.next();
		}

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
					if(!track.type) track.type='album';
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
				})
			},function(err){
				console.error(err)
			})
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
			if(type!=='artist'&&type!=='album') self.deleteArtist(track.artist);
			$scope.search.go(true,'track deleted');
		},function(err){
			console.error(err);
		})
	}
	//undelete a track
	tracks.prototype.undelete = function(track,playing,bulk){
		this.refreshDrawers();
		if(track.name) track.type = 'artist'
		if(!track.type) track.type = 'album'
		if(playing){
			$scope.audio.next();
		}
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
			console.log('delete a track')
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

	tracks.prototype.drawer = function(row){
		var self = this;
		if(!$scope.lib.drawers[$scope.pin.Page]){
			$scope.lib.drawers[$scope.pin.Page]={};
		}
		if(!$scope.lib.drawers[$scope.pin.Page][row.id]){
			$scope.lib.drawers[$scope.pin.Page][row.id]={}
		}
		if($scope.lib.drawers[$scope.pin.Page][row.id].state){
			$scope.lazy.step()
			$scope.lazy.drawer = false
			$scope.lib.drawers[$scope.pin.Page][row.id].state = false;
			$('#drawer'+row.id).height($('#drawer'+row.id+' .drawerInner').outerHeight());
			$scope.tracks.fixChrome()
			$('#drawer'+row.id).height(0);

		}else{
			Object.keys($scope.lib.drawers[$scope.pin.Page]).forEach(function(key){
				if($scope.lib.drawers[$scope.pin.Page][key].state && key!== row.id){
					$scope.lib.drawers[$scope.pin.Page][key].state = false;
					$('#drawer'+key).height($('#drawer'+key+' .drawerInner').outerHeight());
					$('#drawer'+key).height(0);
				}
			})
			$scope.lib.drawers[$scope.pin.Page][row.id].state = true;
			$('#drawer'+row.id).height(0);
			self.drawerContent(row).then(function(){
				var height = $('#drawer'+row.id+' .drawerInner').outerHeight();
				$('#drawer'+row.id).height(height);
				$scope.lazy.drawer = {
					id:row.id,
					height:height,
					active:$scope.pin.Page,
				}
				$scope.lazy.step()
			})
		}

	}
	tracks.prototype.drawerContent = function(row){
		switch($scope.pin.Page){
			case "artist":
				return new Promise(function(resolve,reject){
					$scope.search.artistAlbums(row.name).then(function(data){
						if(data){
							var albums=[{
								id:'youtube',
								name:'Youtube',
								count:0
							}]
							var sort = {};
							var count = 0;

							data.forEach(function(track,index,orig){

								if(track.type === 'youtube'){
									count++;
									albums[0].count++

									if(count===orig.length){proceed()}
								}else if(track.album){
									$scope.db.client.get({index:$scope.db_index,type:'album',id:track.album},function(err,data){
										count++;

										if(!sort[track.album] && data._source.deleted === 'no'){
											sort[track.album] = {
												count:1,
												name:track.metadata.album
											}
										}else if(data._source.deleted === 'no'){
											sort[track.album].count++
										}

										if(count===orig.length){proceed()}
									})
								}
							})
							function proceed(){
								if(!albums[0].count){
									albums=[];
								}
								Object.keys(sort).sort(function(a,b){return sort[b].count-sort[a].count}).forEach(function(key){
									sort[key].id=key;
									albums.push(sort[key]);
								})
								$scope.lib.drawers[$scope.pin.Page][row.id].albums = albums;
								resolve(true);
							}
						}
					});
				})
			break;
			case 'album':
				return new Promise(function(resolve,reject){
					if($scope.lib.drawers[$scope.pin.Page][row.id].discs && !$scope.lib.drawers[$scope.pin.Page][row.id].refresh){
						resolve(true);
						return;
					}
					$scope.lib.drawers[$scope.pin.Page][row.id].refresh = false;
					if(!$scope.lib.drawers[$scope.pin.Page][row.id].discs){
						var discs = []
						Object.keys(row.tracks).forEach(function(key){
							var p1=row.tracks[key].disc-1;
							var p2=row.tracks[key].position-1;
							if(!discs[p1]){
								discs.splice(p1,0,[])
							}
							discs[p1].splice(p2,0,row.tracks[key])
						})
						$scope.lib.drawers[$scope.pin.Page][row.id].discs = discs
					}

					$scope.lib.drawers[$scope.pin.Page][row.id].tracks = {};

					var body = {index:$scope.db_index,type:$scope.pin.pinned.sources,body:{query:{
						bool:{
							should:[{match:{album:{query:row.id,boost:2}}}],
							must_not:[{match:{type:{query:'youtube',type:'phrase'}}}],
							must:[{match:{deleted:{query:'no',type:'phrase'}}}]
						}
					}}}
					$scope.lib.drawers[$scope.pin.Page][row.id].discs.forEach(function(disc,key){
						disc.forEach(function(Track,key2){
							//console.log(Track)
							body.body.query.bool.should.push(
								$scope.tools.wrap.bool([{must:[
									{match:{musicbrainz_id:{query:Track.id,type:'phrase'}}},
									{match:{deleted:{query:'no',type:'phrase'}}}
								]}])

							)
						})

					})
					$scope.db.fetchAll(body).then(function(data){
						data.forEach(function(track){
							if(!$scope.lib.drawers[$scope.pin.Page][row.id].tracks[track.musicbrainz_id]){
								$scope.lib.drawers[$scope.pin.Page][row.id].tracks[track.musicbrainz_id]=track;
							}
						})
						$scope.$apply();
						resolve(true);
					},function(err){
						console.error(err)
					})
				})
			break;

		}
	}
	tracks.prototype.refreshDrawers = function(){
		if($scope.lib.drawers.album) Object.keys($scope.lib.drawers.album).forEach(function(key){
			$scope.lib.drawers.album[key].refresh = true;
		})
	}
	return tracks;
}])
