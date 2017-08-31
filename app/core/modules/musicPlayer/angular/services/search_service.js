'use strict'

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

angular.module('yolk').factory('search',['$timeout',function($timeout) {
	var $scope;
	const tools = require('../../lib/tools/searchtools.js');
	const crypto = require('crypto');
	const Q = require("bluebird");
	const request = require('request');
	const log = false;
	var oldChunk = false;
	var flags = {};
	var context;
	var mem;

	var search = function(scope){
		$scope = scope;
		this.all={};
		this.memory = {};
		this.changed = Yolk.remote('modules').musicPlayer.config.progress;
		var self = this;
		Yolk.test = function(){
			self.go(true,'test refresh')
		}
		Yolk.report = function(){
			console.log(self.memory[context][mem])
		}
	}
	search.prototype.resume=function(scope){
		$scope = scope;
		this.brake = false;
		this.noscroll = true;
		return this;
	}
	search.prototype.fetchmem = function(){
		return this.memory[context][mem];
	}
	search.prototype.context = function(){
		if($scope.playlist.active){
			context = 'playlist';
			mem = $scope.playlist.selected;
		}else{
			context = $scope.pin.Page;
			$scope.pin.Page === 'title'?mem = $scope.pin.pinned.sources.join(''):mem = $scope.pin.Page;
			if($scope.searchTerm) mem+=$scope.searchTerm
			if($scope.pin.Filter) mem+=$scope.pin.Filter;
		}
	}

	search.prototype.makemem = function(scrolltop,libsize,all){
		if(!this.memory[context]) this.memory[context] = {};
		if(!this.memory[context][mem]){
			this.memory[context][mem] = {};
		}
		if(!this.memory[context][mem].chunks) this.memory[context][mem].chunks = {};
		if(!this.memory[context][mem].scrolltop) this.memory[context][mem].scrolltop = scrolltop||0;
		//if(libsize) this.memory[context][mem].libsize = libsize;
		//if(all) this.memory[context][mem].all = all;
		return this.memory;
	}
	var count = 0;
	search.prototype.prepare = function(){
		if(log) console.log('search','prepare()')
		var self = this;
		if(!$scope.lazy.Step) $scope.lazy.step();
		if(!oldChunk) setOldChunk();

		if(this.refresh){
			count++;
			//console.info('%c refresh: '+count,'color:red');
			if(this.memory[context]&&this.memory[context][mem]){
				var scrolltop = this.memory[context][mem].scrolltop;
			}
			if(this.memory[context]) delete this.memory[context];
			this.memory = this.makemem(scrolltop);
		}else{
			this.memory = this.makemem();
		}
		if(this.drawer && this.drawer.close){
			//$scope.drawers.dpos[$scope.pin.Page]={};
			//$scope.drawers.lib[$scope.pin.Page][this.drawer.close].height = 0;
			$scope.drawers.closeall($scope.pin.Page);
			this.drawer = false;
			//return;
		}


		if(typeof this.memory[context][mem].libsize === 'undefined'||!this.drawer){
			//this.brake = true;
			$scope.lazy.scroll(this.memory[context][mem].scrolltop);
			//$('playwindow').scrollTop(0);
		}else{
			this.fixChrome(this.getTop(),'prepare');
		}

		var state={
			chunk:$scope.lazy.chunk === oldChunk.chunk,
			sources:$scope.pin.pinned.sources.length === oldChunk.sources,
			sortby:false,
			searchterm:$scope.searchTerm === oldChunk.searchTerm,
			filter:$scope.pin.Filter === oldChunk.filter,
			page:$scope.pin.Page === oldChunk.page,
			playlist:{
				selected:$scope.playlist.selected===oldChunk.playlistSelected,
				active:$scope.playlist.active===oldChunk.playlistActive
			},
			get:true,
		}

		flags = {size:$scope.lazy.Step*$scope.lazy.over}
		flags.from = 0;
		if($scope.lazy.chunk > 0) flags.from = ($scope.lazy.Step*$scope.lazy.chunk*$scope.lazy.O)-($scope.lazy.Step*$scope.lazy.O)


		if(!state.playlist.selected||!state.playlist.active||!state.searchterm||!state.filter||!state.sources) state.page = false;
		if(!this.refresh && state.chunk && state.sortby && state.searchterm && state.page) state.get = false;
		if((state.page && $scope.pin.sortby[0] === oldChunk.sortby)||!state.page) state.sortby = true;

		if(!state.sortby && this.memory[context][mem].all){ //reverse the order of the active view
			if(log) console.error('search','reverse')
			this.memory[context][mem].all = self.memory[context][mem].all.reverse();
			this.memory[context][mem].chunks = {};
			this.memory[context][mem].scrolltop = 0;
			flags.from = 0;
			state.reversed = true;
			//this.brake = true;
		}
		if($scope.drawers.dpos[$scope.pin.Page].open && !state.page){
			//$scope.drawers.lib[$scope.pin.Page][$scope.drawers.dpos[$scope.pin.Page].open].height = 0;
			//$scope.drawers.dpos[$scope.pin.Page]={};
			$scope.drawers.closeall($scope.pin.Page);
		}
		this.state = state;
	}


	search.prototype.setScroll = function(s){
		if(!this.brake) this.memory[context][mem].scrolltop = s;
	}

	search.prototype.go = function(refresh,origin){
		var self = this;
		if(this.brake){
			//console.info('%c busy:'+origin,'color:red');
			$timeout.cancel(this.retry);
			this.retry = $timeout(function(){
				self.go(refresh,origin)
			},100)
			return;
		}
		this.origin = origin;
		this.page = $scope.pin.Page;
		this.context();
		if(this.changed[$scope.pin.Page]){
			refresh = true;
			$scope.drawers.refreshDrawers($scope.pin.Page);
			this.changed[$scope.pin.Page] = 0;
		}
		this.refresh = refresh;
		this.origin = origin;
		this.prepare();
		setOldChunk();
		if(!this.state.get && !this.drawer) return;
		if(!this.state.get){
			this.goscroll();
			return;
		}
		if(!this.drawer && this.refresh && $scope.drawers.dpos[$scope.pin.Page].open) this.drawer = this.all[$scope.drawers.dpos[$scope.pin.Page].open];
		this.brake = true;
		this.sync = true;
		$scope.loading = true;
		//console.info('%c '+origin,'color:blue');
		if(log) Yolk.print(flags);
		if(log) console.warn('search',$scope.playlist.active?'playlist':$scope.pin.Page);
		if(log) console.warn('refresh:'+this.refresh+' origin:'+origin)

		if($scope.pin.Page!=='title'){
			this[$scope.pin.Page]();
			return;
		}
		if($scope.playlist.active){
			this.playlist(flags);
			return;
		}
		this.title();
	}

	search.prototype.title = function(){
		if(log) console.log('search','go title()')
		var scs = ['download','file','id','metadata.*','path','type','artist','album','date','deleted'];
		var search = {index:$scope.db_index,type:'local,internetarchive,youtube',body:{_source:scs,query:{bool:{must:[{bool:{should:[]}}]}}}};
		search.sort=$scope.pin.sortby;
		search.type = $scope.pin.pinned.sources.toString();
		search.body.query.bool.must.push({match:{'deleted':$scope.pin.Filter === 'deleted' ? 'yes':'no'}});
		search.body.query.bool.must.push({match:{'musicbrainzed':'yes'}});
		Object.keys(flags).forEach(function(key){
			search[key]=flags[key];
		})
		var terms = false;
		if($scope.searchTerm && $scope.searchTerm.length > 1){
			terms = tools.terms($scope.searchTerm);
			if(terms.prefix){
				search.body.query.bool.must[0].bool.should.push({multi_match:
					{query:terms.prefix,operator:"and",fuzziness:'auto',fields:['metadata.title','metadata.artist','metadata.album']}
				})
			}
			['artist','title','album'].forEach(function(field){
				if(terms[field]){
					var match = {match:{}};
					match.match['metadata.'+field]={query:terms[field],fuzziness:'auto',operator:'and'}
					search.body.query.bool.must.push(match);
				}
			})
		}
		this.getMem(search,'title')
	}
	search.prototype.album = function(){
		if(log) console.log('search','go album()')
		var self = this;
		var should = []
		var must = [{bool:{should:should}},{match:{'deleted':$scope.pin.Filter === 'deleted' ? 'yes':'no'}},{match:{'youtube':{query:'no',type:'phrase'}}}];
		var search = {index:$scope.db_index,type:['album'],sort:$scope.pin.sortby,body:{query:{bool:{must:must}}}}
		var terms = false;
		if($scope.searchTerm && $scope.searchTerm.length > 1){
			terms = tools.terms($scope.searchTerm);
			if(terms.prefix){
				should.push({multi_match:{query:terms.prefix,fuzziness:'auto',operator:'and',fields:['metadata.artist','metadata.title']}})
			}
			if(terms.artist){
				must.push({match:{'metadata.artist':{query:terms.artist,fuzziness:'auto',operator:'and'}}})
			}
			if(terms.album && terms.album.toLowerCase()!=='youtube'){
				must.push({match:{'metadata.title':{query:terms.album,fuzziness:'auto',operator:'and'}}})
			}
		}
		Object.keys(flags).forEach(function(key){
			search[key]=flags[key];
		})
		self.getMem(search,'album');
	}

	search.prototype.artist = function(){
		if(log) console.log('search','go artist()')
		var self = this;
		var search = {index:$scope.db_index,type:['artist'],sort:$scope.pin.sortby,body:{query:{bool:{must:[
			{bool:{should:[]}},
			{match:{'deleted':$scope.pin.Filter === 'deleted' ? 'yes':'no'}},
		]}}}}
		var terms = false;
		if($scope.searchTerm && $scope.searchTerm.length > 1){
			terms = tools.terms($scope.searchTerm);
			if(terms.prefix || terms.artist){
				search.body.query.bool.must[0].bool.should.push({match:{'name':{query:terms.prefix ? terms.prefix:terms.artist,fuzziness:'auto',operator:'and'}}})
			}
		}
		Object.keys(flags).forEach(function(key){
			search[key]=flags[key];
		})
		self.getMem(search,'artist',);
	}
	search.prototype.playlist = function(Flags,retry){
		if(log) console.log('search','go playlist()')
		var self = this;
		$scope.playlist.activelist[$scope.playlist.selected] = $scope.playlist.activelist[$scope.playlist.selected].filter(function(id){
			return id;
		})
		var tracks = $scope.playlist.activelist[$scope.playlist.selected];
		if(!tracks) tracks = [];
		var data = [];
		if(retry) tracks.forEach(function(id,index){
			if(index>=Flags.from && index<Flags.size+Flags.from && self.all[id]) data.push(self.all[id])
		})
		if(!retry && tracks.some(function(id,index){
			if(index>=Flags.from && index<Flags.size+Flags.from) data.push(self.all[id]);
			return !self.all[id]
		})){
			var body = tracks.map(function(id){
				return {match:{id:{query:id,type:'phrase'}}}
			})

			body = $scope.tools.wrap.bool([{should:body}]);
			$scope.db.fetchAll({index:$scope.db_index,type:'internetarchive,local,youtube',body:{query:body}}).then(function(data){
				data.forEach(function(track){
					self.all[track.id] = track;
				})
				if(log) console.log('search','refreshing playlist');
				self.sync = false;
				self.playlist(Flags,true);
			},function(err){
				console.error(err)
			})
			return;
		}else{
			$scope.lib.size = tracks.length
			self.memory[context][mem].libsize = tracks.length;
			self.commit(data,'playlist',Flags);
		}
	}
	search.prototype.getMem = function(search,type){
		if(log) console.log('search','getMem('+type+')')
		var self = this;
		if(!self.memory[context][mem].all){
			var activesearch = {};
			Object.keys(search).forEach(function(key){
				if(key!=='from' && key!=='size' && key!=='body') activesearch[key] = search[key];
			})
			activesearch.body={};
			Object.keys(search.body).forEach(function(key){
				if(key!=='_source') activesearch.body[key] = search.body[key]
			})
			activesearch.body._source = "id";

			$scope.db.fetchAll(activesearch).then(function(data){
				data = data.map(function(id){return id.id});
				self.memory[context][mem].libsize = data.length;
				self.memory[context][mem].all = data;
				if(log) console.log('search','renew "All"');
				if($scope.drawers.dpos[self.page].open || self.drawer){
					var r =false;
					if($scope.drawers.dpos[self.page].open) r = self.dcancel($scope.drawers.dpos[self.page].open);
					if(self.drawer) r?self.dcancel(self.drawer.id):r = self.dcancel(self.drawer.id);
					if(r){
						//console.error(self.memory[context][mem].all);
						$scope.$apply(function(){
							self.brake = false;
							self.loading = false;
							self.drawer = false;
							self.go(false,'drawer was not found');
						})
						return;
					}
				}

				self.sync = false;
				self.Search(search,type,flags);
			},function(err){
				console.error('search',err);
			})
		}else{
			self.Search(search,type,flags);
		}
	}
	search.prototype.dcancel = function(id){
		if(this.memory[context][mem].all.indexOf(id) < 0){
			//console.error('no drawer found: '+id)
			//$scope.drawers.lib[this.page][id].height = 0;
			//$scope.drawers.dpos[this.page]={};
			$scope.drawers.closeall(this.page);
			return true;
		}
		return false;
	}
	search.prototype.Search=function(search,type,Flags){
		if(log) console.log('search','Search('+type+')')
		var self = this;
		if(this.memory[context][mem].chunks[$scope.lazy.chunk]){
			$scope.lib.size = self.memory[context][mem].libsize;
			var data = this.memory[context][mem].chunks[$scope.lazy.chunk].map(function(id){
				return self.all[id]
			})
			if(log) console.log('search','from cache')
			self.commit(data,type,Flags);
			return;
		}
		$scope.db.fetch(search).then(function(data){

			if(!data.items || (!data.items.length && data.libsize)){

				$scope.loading = false;
				//console.error(search);
				self.memory[context][mem].scrolltop=0;
				$('#playwindow').scrollTop(0);
				$timeout(function(){
					self.brake = false;
					self.go(false,'error');
				});
				return;
			}

			$scope.lib.size = data.libsize;
			self.memory[context][mem].libsize = data.libsize;
			self.memory[context][mem].chunks[$scope.lazy.chunk] = [];
			data.items.forEach(function(item){
				self.memory[context][mem].chunks[$scope.lazy.chunk].push(item.id);
				self.all[item.id] = item;
			})
			if(log) console.log('search','renew cache');
			self.sync = false;

			self.commit(data.items,type,Flags);

		},function(err){
			if(err) console.error('search',err);
		})
	}


	search.prototype.commit = function(items,type,Flags){
		if(log) console.log('search','commit('+type+')')
		var self = this;
		items = playpos(items,Flags);

		self.memory[context][mem].chunk = $scope.lazy.chunk;
		if(!$scope.playlist.active){
			$scope.tracks.all = self.memory[context][mem].all;
			if($scope.pin.Page === 'title') self.memory.Title = self.memory[context][mem].all;
		}else{
			$scope.tracks.all = $scope.playlist.activelist[$scope.playlist.selected];
		}

		$scope.tracks.isInFocus();


		if(this.sync){
			$scope.loading = false;
			$scope.lib[$scope.pin.Page] = items;
			this.goscroll();
		}else{
			$scope.$apply(function(){
				$scope.loading = false;
				$scope.lib[$scope.pin.Page] = items;
				self.goscroll();
			});
		}



		if(log) console.log('------------------------------------------------------------------------------------------------------------')
		if(type === 'artist'){
			items.forEach(function(row){
				if(!$scope.lib.bios[row.id]){
					$scope.lib.bios[row.id] = true;
					new wiki(row);
				}
			});
		}
	}
	search.prototype.getTop = function(){
		if(!this.memory[context][mem].all) return 0;
		if(!this.drawer||!this.drawer.id) return this.memory[context][mem].scrolltop;
		var newtop = this.memory[context][mem].all.indexOf(this.drawer.id)*$scope.lazy.trackHeight;
		if(log) console.log('getTop: '+newtop);
		return newtop;
	}
	search.prototype.fixChrome = function(top,from){
		$scope.lib.size = this.memory[context][mem].libsize;
		var maxheight = ($scope.lib.size+1)*$scope.dims.trackHeight - $scope.dims.playwindowHeight
		if(maxheight < $scope.dims.playwindowHeight) maxheight = $scope.dims.playwindowHeight;
		if($scope.drawers.dpos[$scope.pin.Page] && $scope.drawers.dpos[$scope.pin.Page].open && $scope.drawers.lib[$scope.pin.Page][$scope.drawers.dpos[$scope.pin.Page].open].h) maxheight+= $scope.drawers.lib[$scope.pin.Page][$scope.drawers.dpos[$scope.pin.Page].open].h;
		if(typeof top === 'undefined'){
			(this.drawer && this.drawer.id)?top = this.getTop():top = this.memory[context][mem].scrolltop;
		}
		if(top > maxheight) top = maxheight;
		if(!maxheight) console.error(this.memory[context][mem],$scope.drawers.dpos[$scope.pin.Page].open,$scope.drawers.lib[$scope.pin.Page])
		//console.warn('from:'+from,'top:'+top,'maxheight:'+maxheight,'libsize:'+$scope.lib.size)
		$scope.drawers.drawerPos('search.fixChrome',top);
		$scope.lazy.fixChrome(top);
	}

	search.prototype.goscroll = function(pos){
		var self = this;
		if(this.origin!=='scroll'){
			var st = this.getTop();
		}else{
			var st = $('#playwindow').scrollTop()
		}
		this.memory[context][mem].scrolltop=st;
		self.fixChrome(st,'goscroll');

		if(this.drawer && this.origin!=='drawer'){
			if($scope.tracks.all.indexOf(this.drawer.id) === -1) alert('goscroll drawer not found');
			$scope.drawers.closeall(this.page);
			//$scope.drawers.drawer(this.drawer,true,this.noscroll);
			$scope.drawers.drawer(this.drawer,true,this.noscroll);
		}

		if($('#playwindow').scrollTop()!==st || this.refresh || !this.state.page){

			if(!this.state.page || this.refresh) this.noscroll = true;
			if(!this.state.page){
				this.noscroll=false;
				$timeout(function(){
					$('#playwindow').stop().scrollTop(st);
					self.brake = false;
				})
			}else{
				if(self.noscroll){
					self.noscroll=false;
					$('#playwindow').stop().scrollTop(st);
					self.brake = false;

				}else{
					$('#playwindow').stop().animate({scrollTop:(st)},750,'easeOutExpo',function(){
						self.brake = false;
					});
				}
			}
		}else{
			this.noscroll = false;
			$timeout(function(){
				self.brake = false;
			})
		}
		this.drawer = false;
	}
	var setOldChunk = function(){
		oldChunk = {
			chunk:$scope.lazy.chunk,
			sources:$scope.pin.pinned.sources.length,
			sortby:$scope.pin.sortby[0],
			searchTerm:$scope.searchTerm,
			page:$scope.pin.Page,
			filter:$scope.pin.Filter,
			playlistSelected:$scope.playlist.selected||1,
			playlistActive:$scope.playlist.active||false
		}
	}

	var playpos = function(items,Flags){
		items.map(function(track,index){
			if(!track.filter) track.filter = {};
			track.filter.pos = index+(Flags.from*1);
			if(track.filter.pos % 2 == 0){
			  track.filter.zebra='even';
			}else{
			  track.filter.zebra='odd';
			}
			return track
		})
		return items;
	}

	//look up artist details from wikipedia
	var wikitypes = ['band','singer-songwriter','singer','musician','performer','orchestra','musical act','rapper','composer','group','soprano','actress','actor','character','artist','combo']
	var wiki = function(row){

		if(log) console.log('search','wiki()')
		if(row.links && row.links.wikipedia){
			$scope.lib.bios[row.id]={}
			var wid = path.basename(row.links.wikipedia);
			var query = "https://en.wikipedia.org/w/api.php?action=query&titles="+wid+"&prop=extracts&exintro=true&explaintext=true&redirects=true&format=json";
		}else{
			var lookup = true;
			var query = "https://www.wikidata.org/w/api.php?action=wbsearchentities&search="+$scope.tools.queryBuilder(row.name)+"&language=en&format=json"
		}
		var headers = Yolk.modules["musicPlayer"].config.headers
		var options={headers:{'User-Agent':headers['User-Agent']},uri:query};
		request.get(options,function(error,response,body){
			if(error){
				console.error('search',error);
				return;
			}
			try {
				var result = JSON.parse(body)
			}
			catch(err){
				console.error('search',err);
				return;
			}

			if(!lookup){
				var bio = result.query.pages[Object.keys(result.query.pages)[0]];
				if($scope.pin.Page === 'artist'){
					$scope.$apply(function(){
						$scope.lib.bios[row.id].bio = bio.extract;
						$scope.lib.bios[row.id].title = bio.title;
						$scope.lib.bios[row.id].outlink='#!/link?loc=https://en.wikipedia.org/?curid='+bio.pageid
					})
				}else{
					$scope.lib.bios[row.id].bio = bio.extract;
					$scope.lib.bios[row.id].title = bio.title;
					$scope.lib.bios[row.id].outlink='#!/link?loc=https://en.wikipedia.org/?curid='+bio.pageid
				}
			}else{
				var artist;
				if(result.search.length){
					result.search.some(function(res){
						return wikitypes.some(function(type){
							if(res.description && res.description.toLowerCase().indexOf(type) > -1){
								artist = res.label;
								return true
							}else{
								//console.log(res.description)
							}
						})
					})
					$scope.lib.bios[row.id]={};
					if(!artist){
						//console.error('no data: '+row.name)
						return;
					}
					options.uri = "https://en.wikipedia.org/w/api.php?action=query&titles="+$scope.tools.queryBuilder(artist)+"&prop=extracts&exintro=true&explaintext=true&redirects=true&format=json";
					request.get(options,function(error, response, body){
						if(error){
							console.error('search',error);
							return;
						}
						try {
							var result = JSON.parse(body)
						}
						catch(err){
							console.error('search',err);
							return
						}
						var bio = result.query.pages[Object.keys(result.query.pages)[0]];
						if(bio){
							if($scope.pin.Page === 'artist'){
								$scope.$apply(function(){
									$scope.lib.bios[row.id].bio = bio.extract;
									$scope.lib.bios[row.id].title = bio.title;
									$scope.lib.bios[row.id].outlink='#!/link?loc=https://en.wikipedia.org/?curid='+bio.pageid
								})
							}else{
								$scope.lib.bios[row.id].bio = bio.extract;
								$scope.lib.bios[row.id].title = bio.title;
								$scope.lib.bios[row.id].outlink='#!/link?loc=https://en.wikipedia.org/?curid='+bio.pageid
							}
						}
					})
				}
			}
		})
	}
	search.prototype.artistAlbums = function(artist){
		if(log) console.log('search','artistAlbums()')
		return new Promise(function(resolve,reject){
			var must = $scope.tools.wrap.bool([{must:[
				{match:{"metadata.artist.exact":{query:artist.toLowerCase()}}},
				{match:{deleted:{query:'no',type:'phrase'}}},
				{match:{musicbrainzed:{query:'yes',type:'phrase'}}}
			]}])
			var query = {index:$scope.db_index,type:"local,internetarchive,youtube",body:{query:must}}
			$scope.db.fetchAll(query).then(function(data){resolve(data)},function(err){reject(err)})
		})
	}

	search.prototype.albumTrack = function(track,album){
		if(log) console.log('search','albumTrack()')
		var query = {
			index:$scope.db_index,
			type:"local,internetarchive,youtube",
			body:{query:{bool:{must:[
				{match:{'deleted':'no'}},
				{match:{'metadata.title':{query:track.title,operator:'and',fuzziness:'auto'}}},
				{bool:{should:[
					{match:{'metadata.artist':{query:track.artist.name,operator:'and',fuzziness:'auto'}}},
					{match:{'metadata.artist':{query:album.artist,operator:'and',fuzziness:'auto'}}},
					{match:{'metadata.album':{query:album.title,operator:'and',fuzziness:'auto',boost:20}}}
				]}}
			]}}}
		}
		return new Promise(function(resolve,reject){
			$scope.db.fetchAll(query).then(function(data){
				resolve(data)
			},function(err){
				reject(err)
			})
		})
	}

	//process the query into external searches
	search.prototype.remoteSearch = function(search_id,e){
		if(log) console.log('search','remoteSearch()')
		if(e && e.which !== 13) return;
		$scope.goSearch = false;
		if($scope.pin.pinned.sources.indexOf('internetarchive')===-1) $scope.pin.source('internetarchive');
		if($scope.pin.pinned.sources.indexOf('youtube')===-1) $scope.pin.source('youtube');
		var search_id = crypto.createHash('sha1').update(search_id).digest('hex');
		var sources = $scope.pin.pinned.sources.filter(function(source){
			if(source!=='local') return true;
		})
		sources.forEach(function(source){
			if($scope[source] && $scope[source].search) $scope[source].search($scope.searchTerm);
		})
	}
	return search;
}])
