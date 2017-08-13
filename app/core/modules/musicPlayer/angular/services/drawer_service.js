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

	drawers.prototype.drawer = function(row,forceopen){
		$scope.search.drawer = false;
		if(log) console.log('drawer','drawer('+row+' '+forceopen+')');
		var self = this;
		if(!this.lib[$scope.pin.Page]){
			this.lib[$scope.pin.Page]={};
		}
		if(!this.lib[$scope.pin.Page][row.id]){
			this.lib[$scope.pin.Page][row.id]={}
		}

		if(this.dpos[$scope.pin.Page].open === row.id){ //close the drawer
			if(forceopen){
				$timeout(function(){
					$scope.search.go(false,'drawer');
				})
				return;
			}
			$timeout(function(){
				self.lib[$scope.pin.Page][row.id].height = 0;
				self.dpos[$scope.pin.Page].open = false;
				$scope.search.go(false,'drawer');
			})
		}else{ //open the drawer
			if(this.dpos[$scope.pin.Page].open) var key = this.dpos[$scope.pin.Page].open;
			this.dpos[$scope.pin.Page].filter = $scope.pin.Filter;
			this.dpos[$scope.pin.Page].open = row.id;
			self.drawerContent(row).then(function(){new go(row)})
			function go(r){
				var self2 = this;
				this.go = function(){
					console.error('go drawer')
					if($('#drawer'+r.id+' .drawerInner').length){
						var height = $('#drawer'+r.id+' .drawerInner').outerHeight();
						$scope.search.scrolltop = r;
						self.lib[$scope.pin.Page][r.id].height = height;
						if(key) self.lib[$scope.pin.Page][key].height = 0;
						$scope.$apply(function(){
							$scope.search.go(false,'drawer');
						});
					}else{
						if($scope.search.scrolltop||r.id!==row.id||$scope.pin.Page!==r.type){
							clearTimeout(this.timeout);
							$scope.search.go(false,'drawer');
							return;
						}
						this.timeout = setTimeout(function(){
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
					if(self.lib[$scope.pin.Page][row.id].albums && !self.lib[$scope.pin.Page][row.id].refresh){
						resolve(true);
						return;
					}
					self.lib[$scope.pin.Page][row.id].refresh = false;
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
									self.lib[$scope.pin.Page][row.id].name = row.name;
									self.lib[$scope.pin.Page][row.id].albums = albums;
								});
								resolve(self.lib[$scope.pin.Page][row.id]);
							}
						}
					});
				})
			break;
			case 'album':
				return new Promise(function(resolve,reject){
					if(self.lib[$scope.pin.Page][row.id].discs && !self.lib[$scope.pin.Page][row.id].refresh){
						resolve(true);
						return;
					}
					self.lib[$scope.pin.Page][row.id].title = row.metadata.title;
					self.lib[$scope.pin.Page][row.id].id = row.id;
					self.lib[$scope.pin.Page][row.id].refresh = false;
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
					self.lib[$scope.pin.Page][row.id].discs = discs
					//}

					self.lib[$scope.pin.Page][row.id].tracks = {};

					var body = {index:$scope.db_index,type:'local,internetarchive',body:{query:{
						bool:{must:[
								{bool:{should:[]}},
								{match:{deleted:{query:'no',type:'phrase'}}}
							]}
					}}}
					self.lib[$scope.pin.Page][row.id].discs.forEach(function(disc,key){
						disc.forEach(function(Track,key2){
							body.body.query.bool.must[0].bool.should.push({match:{musicbrainz_id:{query:Track.id,type:'phrase'}}})
						})

					})
					$scope.db.fetchAll(body).then(function(data){
						$scope.$apply(function(){
							data.forEach(function(track){
								self.lib[$scope.pin.Page][row.id].metadata = row.metadata;
								self.lib[$scope.pin.Page][row.id].tracks[track.musicbrainz_id]=track;
							})
						});
						resolve(self.lib[$scope.pin.Page][row.id]);
					},function(err){
						console.error(err)
					})
				})
			break;

		}
	}
	drawers.prototype.drawerPos = function(scrolltop){
		if($scope.pin.Page === 'title'||!this.dpos[$scope.pin.Page].open){
			this.dpos[$scope.pin.Page]={
				open:false,
				height:0,
				inlist:false,
				fix:false,
			}
			if(log) console.log('drawer','drawerPos('+scrolltop+')');
			$scope.lazy.scroll(scrolltop);

			return;
		}


		if(!this.lib[$scope.pin.Page]){
			this.dpos[$scope.pin.Page].inlist = false
			this.dpos[$scope.pin.Page].fix = false;
			this.dpos[$scope.pin.Page].height = 0;
			if(log) console.log('drawer','drawerPos('+scrolltop+')');
			$scope.lazy.scroll(scrolltop);
			return;
		}

		var index = this.dpos[$scope.pin.Page].open;
		var position = $scope.tracks.all.indexOf(index);
		//this.lib[$scope.pin.Page][index].top = (position+1)*$scope.lazy.trackHeight;
		var top = position*$scope.lazy.trackHeight;
		if(position > -1){
			this.dpos[$scope.pin.Page].inlist = true;
			this.dpos[$scope.pin.Page].height = this.lib[$scope.pin.Page][index].height;
		}else{
			console.error('returning')
			this.dpos[$scope.pin.Page].inlist = false;
			this.dpos[$scope.pin.Page].fix = false;
			this.dpos[$scope.pin.Page].height = 0;
			$scope.lazy.scroll(scrolltop);
			if(log) console.log('drawer','drawerPos('+scrolltop+')');
			//Yolk.print(this.dpos[$scope.pin.Page],'error')
			return;
		}
		var chunkheight = $scope.lazy.chunkHeight*$scope.lazy.O;
		this.dpos[$scope.pin.Page].inChunk = Math.floor(top/chunkheight)+$scope.lazy.O;
		var h =(this.dpos[$scope.pin.Page].inChunk)*chunkheight;
		if(h-$('#playwindow').scrollTop() < 0){
			this.dpos[$scope.pin.Page].fix = true;
		}else{
			this.dpos[$scope.pin.Page].fix = false;
		}
		if(log) console.log('drawer','drawerPos('+scrolltop+')');
		//Yolk.print(this.dpos[$scope.pin.Page],'error')
		$scope.lazy.scroll(scrolltop);

	}
	drawers.prototype.refreshDrawers = function(){
		var self = this;
		['album','artist'].forEach(function(type){
			if(self.lib[type]) Object.keys(self.lib[type]).forEach(function(id){
				if(self.lib[type][id].hasOwnProperty('refresh')){
					self.lib[type][id].refresh = true;
					if(id === self.dpos[$scope.pin.Page].open){
						self.drawerContent($scope.search.all[id]).then(function(data){
							$scope.$apply(function(){
								var height = $('#drawer'+id+' .drawerInner').outerHeight();
								data.height = height;
								self.lib[$scope.pin.Page][id] = data;
							})
						})
					}

				}
			})
		})
	}
	/*
	drawers.prototype.refreshDrawers = function(type){
		if(log) console.warn('drawer','refreshDrawers()');
		var self = this;
		if(this.lib[type]) Object.keys(this.lib[type]).forEach(function(key){
			if(!self.lib[type][key].hasOwnProperty('refresh')) return;

			if(self.dpos[type].open && key===self.dpos[type].open){
				$scope.db.client.get({index:$scope.db_index,type:type,id:key},function(err,data){
					if(err){
						console.error(err);
						return;
					}
					if($scope.pin.Page === type){
						self.dpos[$scope.pin.Page].open = false;
						self.drawer(data._source);
					}else{
						self.lib[type][key].refresh = true;
						self.dpos[$scope.pin.Page].open = false;
						self.lib[type][key].height = 0;
					}
				})
			}else{
				self.lib[type][key].refresh = true;
			}
		})
		return;
		if(this.lib.artist) Object.keys(this.lib.artist).forEach(function(key){
			if(!self.lib.artist[key].hasOwnProperty('refresh')) return;
			self.lib.artist[key].refresh = true;
			if(self.dpos.artist.open && id!==self.dpos.artist.open){
				$scope.db.client.get({index:$scope.db_index,type:'artist',id:self.dpos.artist.open},function(err,data){
					if(err){
						console.error(err);
						return;
					}
					self.drawerContent(data._source,false,'artist')
				})
			}else if(id===self.dpos.artist.open){
				delete self.lib.artist[id];
				self.dpos.artist.open = false;
			}
		})
	}
	*/
	return drawers
}])
