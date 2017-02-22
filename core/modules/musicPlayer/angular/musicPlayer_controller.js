'use strict';


angular.module('yolk').controller('musicPlayer', [
'$scope','$timeout','dims','utils','lazy','audio','jamendo','internetarchive','youtube','tracks','search','pin',
function($scope,$timeout,dims,utils,lazy,audio,jamendo,internetarchive,youtube,tracks,search,pin) {

	const mod_name = 'musicPlayer';
	//const {ipcRenderer} = require('electron');
	const {dialog} = require('electron').remote
	const defaults = require('../musicPlayer.js');
	const path = require('path');
	const Q = require('promise');

	ipcRenderer.send('kill','revive');
	$scope.db_index = defaults.db_index.index;
	$scope.progress={};
	$scope.Sortby={};
	$scope.utils = new utils();
	$scope.db = $scope.utils.db;
	$scope.audio = new audio($scope);
	$scope.search = new search($scope);
	$scope.pin = new pin($scope);
	$scope.lazy = new lazy($scope);
	$scope.tracks = new tracks($scope);
	$scope.jamendo = new jamendo($scope);
	$scope.internetarchive = new internetarchive($scope);
	$scope.youtube = new youtube($scope);
	$scope.dims = new dims($scope);
	$scope.countries = require(path.join(Yolk.root,'core/modules/musicPlayer/lib/tools/countries.json'));
	$scope.tools = require('../lib/tools/searchtools.js');
	$scope.Sort = {};

	$scope.dims.update();
	$scope.lib={
		bios:{},
		tracks:[]
	};
	$scope.allTracks;

	//$scope.data_sources = ['local','jamendo','internetarchive','youtube','torrents'];
	//$scope.data_sources = ['local','internetarchive','youtube'];
	$scope.db.get('global.settings.'+mod_name).then(function(data){
		$scope.settings = data;
		$scope.settings.paths.home = Yolk.home;
		$scope.settings.paths.root = Yolk.root;
		$scope.settings.paths.artist = path.join(Yolk.home,'data/modules',mod_name,Yolk.modules[mod_name].config.data.artist_images);
		$scope.settings.paths.album = path.join(Yolk.home,'data/modules',mod_name,Yolk.modules[mod_name].config.data.album_images);
		$scope.lib.noart = path.join(Yolk.root,'core/modules/musicPlayer/images/noImage.svg');
		$scope.search.go();
		$timeout(function(){
			$scope.settings_loaded = true;
		})
	});

	//stop scanning the local filesystem if window dies
	window.onbeforeunload = function(){
		//console.log('close');
		//ipcRenderer.send('dBase', false);
	};
	/*
	$('#search input').on('submit',function(){
		console.log('submit')
	});
	*/
	$scope.imagePath=function(type,id){
		if(type && id){
			var Path = path.join($scope.settings.paths[type],id,'thumb.jpg');
			return Path;
		}else{
			return false;
		}

	}
	$scope.dev=function(){
		if($scope.dims.dev){
			$scope.dims.dev = false;
		}else{
			$scope.dims.dev = true;
		}
	}



	//set the local music library location and scan files
	$scope.fileSelect= function(){
		dialog.showOpenDialog({properties: ['openDirectory']},function(Dir){
			$scope.settings.paths.musicDir = Dir[0];
			$scope.$apply();
			ipcRenderer.send('getDir', Dir[0]);
		})
	}

	$scope.lib.drawers = {};
	$scope.drawer = function(row){

		if(!$scope.lib.drawers[$scope.pin.Page]){
			$scope.lib.drawers[$scope.pin.Page]={};
		}
		if(!$scope.lib.drawers[$scope.pin.Page][row.id]){
			$scope.lib.drawers[$scope.pin.Page][row.id]={}
		}
		if($scope.lib.drawers[$scope.pin.Page][row.id].state){
			$scope.lib.drawers[$scope.pin.Page][row.id].state = false;
			$('#drawer'+row.id).height($('#drawer'+row.id+' .drawerInner').outerHeight());
			$timeout(function(){
				$('#drawer'+row.id).height(0);
			})

		}else{
			Object.keys($scope.lib.drawers[$scope.pin.Page]).forEach(function(key){
				if($scope.lib.drawers[$scope.pin.Page][key].state && key!== row.id){
					$scope.lib.drawers[$scope.pin.Page][key].state = false;
					$('#drawer'+key).height($('#drawer'+key+' .drawerInner').outerHeight());
					$timeout(function(){
						$('#drawer'+key).height(0);
					})
					$('#drawer'+key).height(0);
				}
			})
			$scope.lib.drawers[$scope.pin.Page][row.id].state = true;
			$('#drawer'+row.id).height(0);
			$scope.drawerContent(row).then(function(){
				var height = $('#drawer'+row.id+' .drawerInner').outerHeight();
				$('#drawer'+row.id).height(height);
			})
		}

	}
	$scope.drawerContent = function(row){
		switch($scope.pin.Page){
			case "artist":
				return new Q(function(resolve,reject){

					$scope.search.artistAlbums(row.name).then(function(data){
						if(data){
							var albums=[{
								id:'youtube',
								name:'Youtube',
								count:0
							}]
							var sort = {};
							data.forEach(function(track){
								if(track.type === 'youtube'){
									albums[0].count++
								}else if(track.album){
									if(!sort[track.album]){
										sort[track.album] = {
											count:1,
											name:track.metadata.album
										}
									}else{
										sort[track.album].count++
									}
								}
							})
							if(!albums[0].count){
								albums=[];
							}
							Object.keys(sort).sort(function(a,b){return sort[b].count-sort[a].count}).forEach(function(key){
								sort[key].id=key;
								albums.push(sort[key]);
							})
							$scope.lib.drawers[$scope.pin.Page][row.id].albums = albums;
							//row.albums = albums;
							$timeout(function(){
								resolve(true);
							})

						}
					});
				})
			break;
			case 'album':
				function update(key,key2,updated,title,id,name){
					$timeout(function(){
						$scope.lib.drawers[$scope.pin.Page][row.id].tracks[key][key2] = updated;
						$scope.lib.drawers[$scope.pin.Page][row.id].tracks[key][key2].title = title;

						$scope.lib.drawers[$scope.pin.Page][row.id].tracks[key][key2].album = id;
						$scope.lib.drawers[$scope.pin.Page][row.id].tracks[key][key2].metadata.album = name;
						$scope.lib.drawers[$scope.pin.Page][row.id].tracks[key][key2].filter={pos:-1}
					})
				}
				return new Q(function(resolve,reject){
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

					//row.tracks = discs;
					var body = {index:$scope.db_index,type:$scope.pin.pinned.sources,body:{query:{
						bool:{should:[{match:{album:{query:row.id,boost:2}}}]}
					}}}
					$scope.lib.drawers[$scope.pin.Page][row.id].discs.forEach(function(disc,key){
						disc.forEach(function(Track,key2){
							//console.log(Track)
							body.body.query.bool.should.push(
								$scope.tools.wrap.bool([{must:[
									{match:{musicbrainz_id:{query:Track.id}}},
									{match:{deleted:{query:'no'}}}
								]}])

							)
							/*
							$scope.search.albumTrack(Track,row.metadata).then(function(data){
								var types = {};
								data.forEach(function(track){
									if(!types[track.type]){
										types[track.type] = [];
									}
									types[track.type].push(track)
								})
								//apply tracks to album list in order of type preference
								if(types.local){
									update(key,key2,types.local[0],row.tracks[key][key2].title,row.id,row.metadata.title)
								}else if(types.internetarchive){
									update(key,key2,types.internetarchive[0],row.tracks[key][key2].title,row.id,row.metadata.title)
								}else if(types.youtube){
									update(key,key2,types.youtube[0],row.tracks[key][key2].title,row.id,row.metadata.title)
								}
							})
							*/
						})

					})

					$scope.db.fetchAll(body).then(function(data){

						data.forEach(function(track){
							if(!$scope.lib.drawers[$scope.pin.Page][row.id].tracks[track.musicbrainz_id]){
								$scope.lib.drawers[$scope.pin.Page][row.id].tracks[track.musicbrainz_id]=track;
							}
						})
						$scope.$apply();
					},function(err){
						console.error(err)
					})
					$timeout(function(){
						resolve(true);
					})

				})
			break;

		}
	}
	var refresh_time = {
		artist:false,
		album:false,
		title:false
	}
	if(!ipcRenderer._events.refresh){
		ipcRenderer.on('refresh',function(event,data){
			if(data === 'artist'||data ==='album'){
				if($scope.pin.Page === data){
					clearTimeout(refresh_time[data]);
					refresh_time[data] = setTimeout(function(){
						$scope.search[data](true);
					},999)
				}
			}else{
				if($scope.pin.Page === 'title'){
					clearTimeout(refresh_time.title);
					refresh_time.title = setTimeout(function(){
						$scope.search.go(true);
					},999)
				}
			}
		});
	}
	if(!ipcRenderer._events.progress){
		ipcRenderer.on('progress',function(event,data){
			$timeout(function(){
				$scope.progress[data.type]=data.size;
			});
		});
	}
	if(!ipcRenderer._events.verify){
		ipcRenderer.on('verify',function(event,data){
			console.log('verify');
			console.log(data);
			$scope.tracks.verify(data);
		});
	}
	/*
	$scope.tools = function(){
		ipcRenderer.send('tools');
	}
	*/
	$('#search').click(function(){
		$('#search input').focus();
	})
	$scope.$watch('settings',function(newVal,oldVal){
		if(newVal!==oldVal && $scope.settings_loaded){
			$scope.db.update({
				index:'global',
				type:'settings',
				id:mod_name,
				body:{doc:newVal}
			}).then(function(data){
				//console.log(data)
			},function(err){
				console.error(err)
			})
		}
	},true);

	$scope.$watch('pin.Page',function(){
		$timeout(function(){

			if($scope.lib.playing && ($scope.pin.Page === 'artist' || $scope.pin.Page === 'album')){
				$scope.lib.playing.filter.pos=-1;
			}
		})


	})

	var searchTime;
	$scope.$watch('searchTerm',function(oldVal,newVal){
		if($scope.searchTerm && $scope.searchTerm.length){
			$('#search .hide').html($scope.searchTerm);
			$('#search input').width($('#search .hide').width()+10+'px');
		}else{
			$('#search input').width('100px')
		}

		if(oldVal!==newVal){
			if($scope.searchTerm && $scope.searchTerm.length > 1){
				$scope.goSearch = true;
			}else{
				$scope.goSearch = false;
			}
			$timeout.cancel(searchTime);
			searchTime = $timeout(function(){
				$scope.search.go();
			},500);
		}
	});

	$scope.$watch('lib.playing.filter.pos',function(oldVal,newVal){
		if(oldVal!==newVal){
			if($scope.lib.playing.filter.pos === -1){
				$('#playing .inner').css({
					position:'fixed',
					top:'auto',
					bottom:0
				}).addClass('Bottom').removeClass('Top');
			}
		}
	})

	//for development purposes - destroy the database and reload
	$scope.nuke=function(){
		ipcRenderer.send('kill');
		$scope.db.client.search({
			index:'global',
			type:'settings',
			size:1000
		}).then(function(data){
			var bulk = []
			data.hits.hits.forEach(function(hit){

				if(hit._id === 'musicPlayer'){
					hit._source.paths.musicDir = false;
				}
				bulk.push({index:{_index:'global',_type:'settings',_id:hit._id}});
				bulk.push(hit._source);

			})
			$scope.db.nuke().then(function(){
				$scope.utils.boot('global').then(function(data){
					$scope.db.client.bulk({body:bulk,refresh:true},function(err,data){
						err ? console.error(err):console.log(data);
						var count = 0;
						Object.keys(Yolk.modules).forEach(function(key){
							count++
							if(Yolk.modules[key].config && Yolk.modules[key].config.db_index){
								console.log(key)
								$scope.utils.boot(Yolk.modules[key].config.db_index)
							}
							if(count === Object.keys(Yolk.modules).length){
								setTimeout(function(){
									window.location.reload();
								},1000)
							}
						});
					})
				})
			})
		})
	}
}])
