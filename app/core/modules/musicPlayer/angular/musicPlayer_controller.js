'use strict';

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

angular.module('yolk').controller('musicPlayer', [
'$scope','$interval','$timeout','$rootScope','dims','lazy','audio','internetarchive','youtube','tracks','drawers','search','pin','playlist',
function($scope,$interval,$timeout,$rootScope,dims,lazy,audio,internetarchive,youtube,tracks,drawers,search,pin,playlist) {
	const {dialog} = require('electron').remote
	const path = require('path');
	const mod_name = 'musicPlayer';
	$('#search').click(function(){
		$('#search input').focus();
	})
	delete Yolk.controls.html.musicPlayer;
	Yolk.prepare($rootScope[mod_name]||$scope,mod_name).then(function(){
		$scope.$apply(function(){
			$scope.settings.paths.artist = path.join(Yolk.home,'data/modules',mod_name,Yolk.modules[mod_name].config.data.artist_images);
			$scope.settings.paths.album = path.join(Yolk.home,'data/modules',mod_name,Yolk.modules[mod_name].config.data.album_images);
			if($scope.settings.paths.musicDir && !$rootScope[mod_name]) ipcRenderer.send('verify', $scope.settings.paths.musicDir);
			$rootScope[mod_name] = $scope;
		})
	});

	$scope.ytpreload = path.join(Yolk.root,'/core/modules/musicPlayer/lib/tools/youtube.js');
	$scope.countries = require('../lib/tools/countries.json');
	$scope.tools = require('../lib/tools/searchtools.js');


	if(!$rootScope[mod_name]){
		ipcRenderer.send('kill','revive');
		$scope.progress={};
		$scope.Sortby={};
		$scope.refresh={};
		$scope.image = {};
		$scope.searchTerm='';
		$scope.audio=new audio($scope);
		$scope.pin=new pin($scope);
		$scope.playlist=new playlist($scope);
		$scope.dims=new dims($scope);
		$scope.lazy=new lazy($scope);
		$scope.tracks=new tracks($scope);
		$scope.drawers=new drawers($scope);
		$scope.internetarchive=new internetarchive($scope);
		$scope.youtube=new youtube($scope);
		$scope.search=new search($scope);

	}else{
		Object.keys($rootScope[mod_name]).forEach(function(key){
			if($rootScope[mod_name].hasOwnProperty(key)&&key.indexOf('$')===-1){
				$scope[key]=$rootScope[mod_name][key];
				if($scope[key].resume) $scope[key].resume($scope);
			}
		})
	}

	$scope.Sort = !$rootScope[mod_name]?{}:$rootScope[mod_name].Sort;
	$scope.lib=!$rootScope[mod_name]?{
		bios:{},
		tracks:[],
		padding:0,
		playingstyle:{}
	}:$rootScope[mod_name].lib;

	$scope.lib.noart = path.join(Yolk.root,'core/modules/musicPlayer/images/noImage.svg');
	$scope.dims.update();


	if(!$rootScope[mod_name]){
		$scope.search.go(true,'init');
	}else{
		//$scope.audio.player.play();
		$('#playwindow').ready(function(){
			setTimeout(function(){
				$('#playwindow').scrollTop($scope.search.fetchmem().scrolltop);
			})
		})
	}



	$scope.$on('$locationChangeSuccess', function(event) {
		$scope.audio.background();
	});
	function progresstimer(){
		$timeout.cancel($scope.progress_timer);
		var types = ['internetarchive','youtube','musicbrainz'];
		types.some(function(type){
			if(!$scope[type]) return false;
			if($scope.progress[type] && !$scope[type].progress || !$scope.progress[type] && $scope[type].progress){
				/*
				if($scope[type].progress && !$scope.slowmessage){
					$scope.slowmessage=true;
					$timeout(function(){
						$scope.slowmessage=false;
					},5000)
				}
				*/
				$scope.progress[type] = $scope[type].progress;
				return true;
			}
			return false;
		})
		types.forEach(function(type){
			if(!$scope[type]) return;
			$('#sidebar .progress .'+type).html($scope[type].progress);
		})
		$scope.progress_timer = $timeout(function(){
			progresstimer();
		},1000)
	}
	progresstimer();
	//stop scanning the local filesystem if window dies
	window.onbeforeunload = function(){
		//console.log('close');
		//ipcRenderer.send('dBase', false);
	};

	var searchTime;
	$scope.$watch('searchTerm',function(oldVal,newVal){
		if($scope.searchTerm && $scope.searchTerm.length){
			//$('#search .hide').html($scope.searchTerm);
			//$('#search input').width($('#search .hide').width()+10+'px');
		}else{
			//$('#search input').width('100px')
		}

		if(oldVal!==newVal){
			if($scope.searchTerm && $scope.searchTerm.length > 1){
				$scope.goSearch = true;
				var terms = $scope.tools.terms($scope.searchTerm);
				$scope.pin.pinned.prefix = terms.prefix;
				$scope.pin.pinned.album = terms.album;
				$scope.pin.pinned.artist = terms.artist;
				$scope.pin.pinned.title = terms.title;
			}else{
				$scope.pin.pinned.prefix = false;
				$scope.pin.pinned.album = false;
				$scope.pin.pinned.artist = false;
				$scope.pin.pinned.title = false;
				$scope.goSearch = false;
			}
			clearTimeout(searchTime);
			if($scope.searchNow){
				$scope.searchNow = false;
				if($scope.searchNow === 'skip') return;
				$scope.search.go(false,'searchterm');
			}else{
				searchTime = setTimeout(function(){
					$scope.search.go(false,'searchterm');
				},500);
			}
		}
	});

	$scope.dev=function(info,type){
		console.log(info.filter)
		$scope.db.client.get({index:$scope.db_index,type:type,id:info.id},function(err,data){
			console.info('-------------------------------------------------------------------------------------------------');
			if(data._source.metadata){
				Object.keys(data._source.metadata).forEach(function(key){
					console.log(key+': '+data._source.metadata[key])
				})
			}
			console.info(data._source)
			console.info('-------------------------------------------------------------------------------------------------');
		})
		return;
		if($scope.dims.dev){
			$scope.dims.dev = false;
		}else{
			$scope.dims.dev = true;
		}
	}



	//set the local music library location and scan files
	$scope.fileSelect= function(){
		dialog.showOpenDialog({properties: ['openDirectory']},function(Dir){
			if(!Dir || !Dir.length) return;
			$scope.$apply(function(){
				if(!$scope.settings.paths.musicDir){
					ipcRenderer.send('getDir', Dir[0]);
				}else{
					ipcRenderer.send('verify', Dir[0]);
				}
				$scope.settings.paths.musicDir = Dir[0];
			});
		})
	}

	if(!ipcRenderer._events.refresh){
		ipcRenderer.on('refresh',function(event,data){
			Object.keys(data).forEach(function(page){
				if(data[page].length){
					$scope.refresh[page]?$scope.refresh[page]++:$scope.refresh[page]=1;
				}
			})
			$scope.refresh.title = 1;
			$scope.drawers.refreshDrawers();
			if($scope.refresh[$scope.pin.Page]){
				$scope.search.go(true);
			}

		});
	}
	if(!ipcRenderer._events.progress){
		ipcRenderer.on('progress',function(event,data){
			if(data.type === 'musicbrainz'){
				if(!$scope.musicbrainz) $scope.musicbrainz = {}
				$scope.musicbrainz.progress = data.size;
			}
		});
	}
	if(!ipcRenderer._events.verify){
		ipcRenderer.on('verify',function(event,data){
			if(data.remove.length){
				Object.keys($scope.playlist.activelist).forEach(function(list){
					$scope.playlist.activelist[list]=$scope.playlist.activelist[list].filter(function(id){
						return !data.remove.some(function(track){
							return track.id === id;
						})
					})
				})
				$scope.search.go(true);
				var artists = [];
				data.remove.forEach(function(track){
					if(artists.indexOf(track.artist) === -1){
						artists.push(track.artist);
						$scope.tracks.deleteArtist(track.artist)
					}
				})
			}
		});
	}
	if(!ipcRenderer._events.albums){
		ipcRenderer.on('albums',function(event,data){
			$scope.search.go(true);
		});
	}

	if(!ipcRenderer._events.newart){
		ipcRenderer.on('newart',function(event,data){
			if($scope.pin.Page === data.item.type) $scope.$apply(function(){
				$scope.image[data.item.id] = data.dest;
			})
		});
	}
	$scope.albums = function(){
		ipcRenderer.send('albums');
	}
	$scope.refreshart = function(data){
		$scope.db.client.get({index:$scope.db_index,type:data.type,id:data.id},function(err,data){
			if(err){
				console.error(err);
				return;
			}
			var track = data._source;
			var data = {
				id:track.id,
				type:track.type,
				name:track.type==='album'?track.metadata.title:track.name,
				artist:track.type==='album'?track.metadata.artist:false,
				coverart:track.links.coverart,
				discogs:track.links.discogs,
				images:track.links.images||[],
				refresh:true
			}
			ipcRenderer.send('refreshart',data);
		})
	}
	$scope.stop = function(){
		$scope.internetarchive.kill();
		$scope.youtube.kill();
		ipcRenderer.send('kill');
		setTimeout(function(){
			ipcRenderer.send('kill','revive');
		})
	}
	//for development purposes - destroy the database and reload
	$scope.nuke=function(){
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
