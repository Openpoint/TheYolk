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

angular.module('yolk').factory('drawers',['$timeout',function($timeout) {
	var $scope;
	const log = false;
	var drawers = function(scope){
		$scope = scope;
		this.lib={};
		this.dpos={
			album:{},
			artist:{},
			title:{}
		};
	}
	drawers.prototype.resume=function(scope){
		$scope = scope;
		return this;
	}

	drawers.prototype.drawer = function(row,forceopen,noscroll){
		$scope.search.drawer = false;
		if(!row.type||(row.type==='album' && !row.metadata)) return;
		if(log) console.log('drawer','drawer('+row+' '+forceopen+')');
		var self = this;
		if(!this.lib[$scope.pin.Page]){
			this.lib[$scope.pin.Page]={};
		}
		if(!this.lib[$scope.pin.Page][row.id]){
			this.lib[$scope.pin.Page][row.id]={}
		}

		if(this.dpos[$scope.pin.Page].open === row.id){ //close the drawer
			if(forceopen) return;
			$scope.search.drawer={close:row.id};
			$scope.search.go(false,'drawer close');
		}else{ //open the drawer
			var key = this.dpos[$scope.pin.Page].open;
			if(key && key !== row.id){
				/*
				$scope.search.drawer={close:key};
				$scope.search.go(false,'drawer close');
				*/
				self.lib[$scope.pin.Page][key].height = 0;
				this.dpos[$scope.pin.Page]={};


			}
			this.dpos[$scope.pin.Page].filter = $scope.pin.Filter;
			this.dpos[$scope.pin.Page].open = row.id;

			self.drawerContent(row).then(function(){new go(row)})
			function go(r){
				var self2 = this;
				this.go = function(){
					if($('#drawer'+r.id+' .drawerInner').length){
						if(log) console.warn(r);
						var height = $('#drawer'+r.id+' .drawerInner').outerHeight();
						self.lib[$scope.pin.Page][r.id].h = height;
						self.lib[$scope.pin.Page][r.id].height = height;
						$scope.search.noscroll = noscroll;
						$scope.search.drawer = r;
						$scope.$apply(function(){
							$scope.search.go(false,'drawer');
						});
					}else{
						if($scope.search.refresh) $scope.search.drawer = false;
						if($scope.search.drawer||r.id!==row.id||$scope.pin.Page!==r.type.toLowerCase()){
							console.error('reject drawer',$scope.search.drawer,r.id!==row.id,$scope.pin.Page!==r.type.toLowerCase())
							$timeout.cancel(this.timeout);
							//$scope.search.drawer = false;
							//$scope.search.go(false,'drawer');
							return;
						}
						this.timeout = $timeout(function(){
							self2.go();
						},100)
					}
				}
				this.go()
			}
		}
	}
	drawers.prototype.drawerContent = function(row,plist){
		if(log) console.log('drawer','drawerContent()');
		var self = this;
		if(!self.lib[$scope.pin.Page]) self.lib[$scope.pin.Page]={}
		if(!self.lib[$scope.pin.Page][row.id]) self.lib[$scope.pin.Page][row.id] ={}
		switch($scope.pin.Page){
			case "artist":
				return new Promise(function(resolve,reject){
					if(self.lib[$scope.pin.Page][row.id].albums && !self.lib[$scope.pin.Page][row.id].refresh && !plist){
						resolve(true);
						return;
					}
					self.lib.artist[row.id].refresh = false;
					$scope.search.artistAlbums(row.name).then(function(data){
						if(plist){
							resolve(data);
							return;
						}
						if(data){
							var albums=[{
								id:'youtube',
								name:'Youtube',
								count:0
							}]
							var sort = {};
							var count = 0;
							function get(){
								if(!data.length){
									proceed();
									return;
								}
								if(data.length) var track = data.shift();
								if(track.type === 'youtube'){
									count++;
									albums[0].count++
									get();
								}else if(sort[track.album]){
									count++
									sort[track.album].count++
									get();
								}else{
									$scope.db.client.get({index:$scope.db_index,type:'album',id:track.album},function(err,data){
										count++;
										sort[track.album] = {
											count:1,
											name:track.metadata.album
										}
										get();
									})
								}
							}
							get();
							function proceed(){
								if(!albums[0].count){
									albums=[];
								}
								Object.keys(sort).sort(function(a,b){return sort[b].count-sort[a].count}).forEach(function(key){
									sort[key].id=key;
									albums.push(sort[key]);
								})
								$scope.$apply(function(){
									self.lib.artist[row.id].name = row.name;
									self.lib.artist[row.id].albums = albums;
								});
								resolve(self.lib.artist[row.id]);
							}
						}
					});
				})
			break;
			case 'album':
				return new Promise(function(resolve,reject){
					if(self.lib.album[row.id].discs && !self.lib.album[row.id].refresh){
						resolve(true);
						return;
					}
					if(!row.metadata){
						console.error('no metadata',row)
						return;
					}
					self.lib.album[row.id].title = row.metadata.title;
					self.lib.album[row.id].id = row.id;
					self.lib.album[row.id].refresh = false;
					//if(!self.lib[$scope.pin.Page][row.id].discs){
					var discs = []
					Object.keys(row.tracks).forEach(function(key){
						var p1=row.tracks[key].disc-1;
						var p2=row.tracks[key].position-1;
						if(!discs[p1]){
							discs.splice(p1,0,[])
						}
						discs[p1].splice(p2,0,row.tracks[key])
					})
					self.lib.album[row.id].discs = discs
					//}

					self.lib.album[row.id].tracks = {};

					var body = {index:$scope.db_index,type:'local,internetarchive',body:{query:{
						bool:{must:[
								{bool:{should:[]}},
								{match:{deleted:{query:'no',type:'phrase'}}}
							]}
					}}}
					self.lib.album[row.id].discs.forEach(function(disc,key){
						disc.forEach(function(Track,key2){
							body.body.query.bool.must[0].bool.should.push({match:{musicbrainz_id:{query:Track.id,type:'phrase'}}})
						})

					})
					self.lib.album[row.id].metadata = row.metadata;
					$scope.db.fetchAll(body).then(function(data){
						$scope.$apply(function(){
							data.forEach(function(track){
								self.lib.album[row.id].tracks[track.musicbrainz_id]=track;
							})
						});
						resolve(self.lib.album[row.id]);
					},function(err){
						console.error(err)
					})
				})
			break;

		}
	}
	drawers.prototype.closeall = function(page){
		if(!this.lib[page]) return;
		var self = this;
		Object.keys(this.lib[page]).forEach(function(id){
			if(self.lib[page][id].hasOwnProperty('height')) self.lib[page][id].height = 0;
		})
		this.dpos[page]={};
	}
	drawers.prototype.drawerPos = function(from,scrolltop){

		if($scope.pin.Page === 'title'||!this.dpos[$scope.pin.Page].open||!$scope.search.fetchmem().all){
			if(log) console.log('drawer1','drawerPos('+scrolltop+')');
			$scope.lazy.scroll(scrolltop);
			return;
		}
		var index = this.dpos[$scope.pin.Page].open;
		var position = $scope.search.fetchmem().all.indexOf(index);
		if(position < 0){
			alert('drawerPos not found: '+from);
			console.error(index,$scope.search.fetchmem().all);
			return;
		}
		var top = position*$scope.lazy.trackHeight;

		this.dpos[$scope.pin.Page].height = this.lib[$scope.pin.Page][index].h;
		var chunkheight = $scope.lazy.chunkHeight*$scope.lazy.O;
		this.dpos[$scope.pin.Page].inChunk = Math.floor(top/chunkheight)+$scope.lazy.O;
		var h =(this.dpos[$scope.pin.Page].inChunk)*chunkheight;
		if(h-$('#playwindow').scrollTop() < 0){
			this.dpos[$scope.pin.Page].fix = true;
		}else{
			this.dpos[$scope.pin.Page].fix = false;
		}
		if(log) console.log('drawer2','drawerPos('+scrolltop+')');
		//Yolk.print(this.dpos[$scope.pin.Page],'error')

		$scope.lazy.scroll(scrolltop);
	}
	drawers.prototype.refreshDrawers = function(type){
		var self = this;
		var types = ['album','artist'];
		types.forEach(function(type){
			if(self.lib[type]) Object.keys(self.lib[type]).forEach(function(id){
				if(self.lib[type][id].hasOwnProperty('refresh')){
					self.lib[type][id].refresh = true;
				}
			})
		})
	}

	return drawers
}])
