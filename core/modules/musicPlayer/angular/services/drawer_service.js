"use strict"
angular.module('yolk').factory('drawers',['$timeout',function($timeout) {
	var $scope;

	var drawers = function(scope){
		$scope = scope;
		this.lib={};
		this.dpos={
			album:{isvis:false},
			artist:{isvis:false},
			title:{isvis:false}
		};
	}

	drawers.prototype.drawer = function(row,forceopen,scroll){
		var self = this;
		if(!this.lib[$scope.pin.Page]){
			this.lib[$scope.pin.Page]={};
		}
		if(!this.lib[$scope.pin.Page][row.id]){
			this.lib[$scope.pin.Page][row.id]={}
		}
		if(this.dpos[$scope.pin.Page].open === row.id){ //close the drawer

			if(forceopen){
				self.lib[$scope.pin.Page][row.id].top = ($scope.tracks.all.indexOf(row.id)+1)*$scope.lazy.trackHeight;
				if(!scroll){
					$('#playwindow').scrollTop(self.lib[$scope.pin.Page][row.id].top-$scope.lazy.trackHeight);
					$scope.lazy.fixChrome();
				}else{
					$('#playwindow').animate({scrollTop:(self.lib[$scope.pin.Page][row.id].top-$scope.lazy.trackHeight)},1000,'swing');
				}
				return;
			}
			this.dpos[$scope.pin.Page].open = false;
			this.lib[$scope.pin.Page][row.id].height = 0;
			$scope.lazy.fixChrome()
		}else{ //open the drawer
			if(this.dpos[$scope.pin.Page].open){ //close open drawers on page
				var key = this.dpos[$scope.pin.Page].open;
				self.lib[$scope.pin.Page][key].height = 0;
				$scope.drawers.dpos[$scope.pin.Page].pad = false;
				if(!$scope.lib[$scope.pin.Page].some(function(track){
					return track.id === key;
				})){
					if($scope.lazy.chunk){
						var padding = (($scope.lazy.Step*$scope.lazy.chunk*$scope.lazy.O)-($scope.lazy.Step*$scope.lazy.O))*$scope.lazy.trackHeight;
					}else{
						var padding = 0;
					}
					var height = $scope.lib.size*$scope.lazy.trackHeight;
					self.dpos[$scope.pin.Page].open = false;
					self.dpos[$scope.pin.Page].spacer = 0;
					$scope.dims.dyn = {
						paddingTop:padding,
						height:height-padding+$scope.lazy.trackHeight
					}
				}
			}
			this.dpos[$scope.pin.Page].filter = $scope.pin.Filter;
			this.dpos[$scope.pin.Page].open = row.id;
			var index = $scope.tracks.all.indexOf(row.id);
			self.lib[$scope.pin.Page][row.id].top = (index+1)*$scope.lazy.trackHeight;
			function go(){
				if($scope.lib[$scope.pin.Page].some(function(track){
					return track.id === row.id;
				})){
					var height = $('#drawer'+row.id+' .drawerInner').outerHeight();
					$scope.$apply(function(){
						console.error('height:'+height)
						self.lib[$scope.pin.Page][row.id].height = height;
						$scope.lazy.fixChrome();
					})
				}else{
					setTimeout(function(){
						go();
					},100)
				}
			}

			self.drawerContent(row).then(function(){
				go();
				if(forceopen && !scroll){
					$('#playwindow').scrollTop(self.lib[$scope.pin.Page][row.id].top-$scope.lazy.trackHeight);
					$scope.lazy.fixChrome();
				}else{
					$('#playwindow').stop().animate({scrollTop:(self.lib[$scope.pin.Page][row.id].top-$scope.lazy.trackHeight)},1000,'swing');
				}

			})
		}
	}

	drawers.prototype.drawerPos = function(){

		if(!this.lib[$scope.pin.Page]||!this.dpos[$scope.pin.Page].open){
			this.dpos[$scope.pin.Page].inlist = false
			this.dpos[$scope.pin.Page].fix = false;
			this.dpos[$scope.pin.Page].height = 0;
			$scope.lazy.scroll();
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
			this.dpos[$scope.pin.Page].inlist = false;
			this.dpos[$scope.pin.Page].fix = false;
			this.dpos[$scope.pin.Page].height = 0;
			$scope.lazy.scroll();
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
		$scope.lazy.scroll();
	}

	drawers.prototype.drawerContent = function(row,plist,Page){
		var self = this;
		if(!self.lib[$scope.pin.Page]) self.lib[$scope.pin.Page]={}
		if(!self.lib[$scope.pin.Page][row.id]) self.lib[$scope.pin.Page][row.id] ={}
		switch(Page||$scope.pin.Page){
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
									self.lib[$scope.pin.Page][row.id].albums = albums;
								});
								resolve(true);
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
					if(!self.lib[$scope.pin.Page][row.id].discs){
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
					}

					self.lib[$scope.pin.Page][row.id].tracks = {};

					var body = {index:$scope.db_index,type:'local,internetarchive',body:{query:{
						bool:{must:[
								{bool:{should:[]}},
								{match:{deleted:{query:'no',type:'phrase'}}}
							]}}}}
					self.lib[$scope.pin.Page][row.id].discs.forEach(function(disc,key){
						disc.forEach(function(Track,key2){
							body.body.query.bool.must[0].bool.should.push({match:{musicbrainz_id:{query:Track.id,type:'phrase'}}})
						})

					})
					$scope.db.fetchAll(body).then(function(data){
						$scope.$apply(function(){
							data.forEach(function(track){
								self.lib[$scope.pin.Page][row.id].tracks[track.musicbrainz_id]=track;
							})
						});
						resolve(true);
					},function(err){
						console.error(err)
					})
				})
			break;

		}
	}

	drawers.prototype.refreshDrawers = function(deleted){
		var self = this;
		if(this.lib.album) Object.keys(this.lib.album).forEach(function(key){
			if(!self.lib.album[key].hasOwnProperty('refresh')) return;
			self.lib.album[key].refresh = true;
			if(self.dpos.album.open && deleted!==self.dpos.album.open){
				$scope.db.client.get({index:$scope.db_index,type:'album',id:self.dpos.album.open},function(err,data){
					if(err){
						console.error(err);
						return;
					}
					self.drawerContent(data._source,false,'abum')
				})
			}else if(deleted===self.dpos.album.open){

				delete self.lib.album[deleted];
				self.dpos.album.open = false;
			}
		})
		if(this.lib.artist) Object.keys(this.lib.artist).forEach(function(key){
			if(!self.lib.artist[key].hasOwnProperty('refresh')) return;
			self.lib.artist[key].refresh = true;
			if(self.dpos.artist.open && deleted!==self.dpos.artist.open){
				$scope.db.client.get({index:$scope.db_index,type:'artist',id:self.dpos.artist.open},function(err,data){
					if(err){
						console.error(err);
						return;
					}
					console.log(data)
					self.drawerContent(data._source,false,'artist')
				})
			}else if(deleted===self.dpos.artist.open){
				delete self.lib.artist[deleted];
				self.dpos.artist.open = false;
			}
		})
	}

	return drawers
}])
