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
		if(this.lib[$scope.pin.Page][row.id].state){ //close the drawer
			if(forceopen){
				function go(loop,fil){
					if(fil) $scope.search.go();
					if(loop && !$('#drawer'+row.id).length){
						setTimeout(function(){
							go(true);
						},100);
						return;
					}
					if(scroll){
						$('#playwindow').animate({scrollTop:(self.lib[$scope.pin.Page][row.id].top-$scope.lazy.trackHeight)},1000,'swing');
						return;
					}
					$('#playwindow').scrollTop(self.lib[$scope.pin.Page][row.id].top-$scope.lazy.trackHeight);
					self.drawerPos();
					$scope.lazy.fixChrome();
				}
				if(!$('#drawer'+row.id).length && ($scope.searchTerm||$scope.pin.Filter!==this.dpos[$scope.pin.Page].filter) && $scope.pin.Page!=='title'){
					console.error($scope.searchTerm)
					$scope.searchTerm = '';
					var fil = false;
					if($scope.pin.Filter !== this.dpos[$scope.pin.Page].filter){
						fil = true;
						$scope.pin.Filter = this.dpos[$scope.pin.Page].filter
					}
					go(true,fil);
					return;
				};
				go();
				return;
			}
			this.lib[$scope.pin.Page][row.id].state = false;
			this.dpos[$scope.pin.Page].open = false;
			this.lib[$scope.pin.Page][row.id].height = 0;
			this.dpos[$scope.pin.Page].spacer = 0;
			$scope.lazy.fixChrome()
		}else{ //open the drawer
			if(this.dpos[$scope.pin.Page].open){ //close open drawers on page
				var key = this.dpos[$scope.pin.Page].open;
				this.lib[$scope.pin.Page][key].state = false;
				this.lib[$scope.pin.Page][key].height = 0;
				if(!$('#drawer'+key).length) this.dpos[$scope.pin.Page].spacer = 0
			}
			this.lib[$scope.pin.Page][row.id].top = (row.filter.pos+1)*$scope.lazy.trackHeight;
			this.lib[$scope.pin.Page][row.id].state = true;
			this.dpos[$scope.pin.Page].filter = $scope.pin.Filter;

			self.drawerContent(row).then(function(){
				var height = $('#drawer'+row.id+' .drawerInner').outerHeight();
				self.dpos[$scope.pin.Page].open = row.id;
				$scope.$apply(function(){
					self.lib[$scope.pin.Page][row.id].height = height;
				})

				//$('#drawer'+row.id).height(height);
				//self.dpos[$scope.pin.Page].open = true;
				$scope.lazy.fixChrome();
				$('#playwindow').animate({scrollTop:(self.lib[$scope.pin.Page][row.id].top-$scope.lazy.trackHeight)},1000,'swing');
			})
		}
	}
	function calc(ch,h){
		var scrolltop = $('#playwindow').scrollTop();
		if(h) scrolltop-=h;
		return Math.floor(scrolltop/ch);
		//return Math.floor(($('#playwindow').scrollTop()-(h||0))/chunkheight);
	}

	drawers.prototype.drawerPos = function(){

		if(!this.lib[$scope.pin.Page]||!this.dpos[$scope.pin.Page].open){
			$scope.lazy.scroll();
			return;
		}
		var index = this.dpos[$scope.pin.Page].open;
		var position = $scope.tracks.all.indexOf(index);
		this.lib[$scope.pin.Page][index].top = (position+1)*$scope.lazy.trackHeight;
		var top = position*$scope.lazy.trackHeight;
		if(position > -1){
			this.dpos[$scope.pin.Page].inlist = true;
			this.dpos[$scope.pin.Page].height = this.lib[$scope.pin.Page][index].height;
		}else{
			this.dpos[$scope.pin.Page].inlist = false
			this.dpos[$scope.pin.Page].fix = false;
			this.dpos[$scope.pin.Page].height = 0;
			$scope.lazy.scroll();
			return;
		}
		var chunkheight = $scope.lazy.chunkHeight*$scope.lazy.O;
		this.dpos[$scope.pin.Page].inChunk = Math.floor(top/chunkheight)+$scope.lazy.O;
		var h =(this.dpos[$scope.pin.Page].inChunk)*chunkheight;
		//$('#tester').css({top:0,height:h,background:'green'});
		//$('#tester .message').html(h-$('#playwindow').scrollTop())
		if(h-$('#playwindow').scrollTop() < 0){
			this.dpos[$scope.pin.Page].fix = true;
		}else{
			this.dpos[$scope.pin.Page].fix = false;
		}
		$scope.lazy.scroll();
	}

	drawers.prototype.drawerContent = function(row,plist){
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

	drawers.prototype.refreshDrawers = function(){
		if($scope.drawers.lib.album) Object.keys($scope.drawers.lib.album).forEach(function(key){
			$scope.drawers.lib.album[key].refresh = true;
		})
		if($scope.drawers.lib.artist) Object.keys($scope.drawers.lib.artist).forEach(function(key){
			$scope.drawers.lib.artist[key].refresh = true;
		})
	}

	return drawers
}])
