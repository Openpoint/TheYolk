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
	}
	search.prototype.resume=function(scope){
		$scope = scope;
		return this;
	}
	search.prototype.fetchmem = function(){
		return this.memory[context][mem];
	}
	search.prototype.makemem = function(){

		if($scope.playlist.active){
			context = 'playlist';
			mem = $scope.playlist.selected;
		}

		if(!$scope.playlist.active){
			context = $scope.pin.Page;
			$scope.pin.Page === 'title'?mem = $scope.pin.pinned.sources.join(''):mem = $scope.pin.Page;
			if($scope.searchTerm) mem+=$scope.searchTerm
			if($scope.pin.Filter) mem+=$scope.pin.Filter;
		}

		if(!this.memory[context]) this.memory[context] = {};
		if(!this.memory[context][mem]){
			this.memory[context][mem] = {};
		}
		if(!this.memory[context][mem].chunks) this.memory[context][mem].chunks = {};
		return this.memory;
	}
	search.prototype.prepare = function(refresh){
		//if(log) console.log('search','prepare()')
		var self = this;
		if(!$scope.lazy.Step) $scope.lazy.step();
		if(refresh){
			if(this.memory[context]) var scrolltop = this.memory[context][mem].scrolltop;
			this.memory = {Title:this.memory.Title};
			this.memory = this.makemem();
			if(typeof scrolltop !== 'undefined') this.memory[context][mem].scrolltop = scrolltop;
		}else{
			this.memory = this.makemem();
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
		flags.from = 0
		if(typeof self.memory[context][mem].chunk!=='undefined' && (!state.page||!state.playlist.active||!state.playlist.selected)){
			$scope.lazy.chunk = self.memory[context][mem].chunk
		}
		if($scope.lazy.chunk){
			flags.from = ($scope.lazy.Step*$scope.lazy.chunk*$scope.lazy.O)-($scope.lazy.Step*$scope.lazy.O)
		}
		if(!state.playlist.selected||!state.playlist.active||!state.searchterm||!state.filter||!state.sources) state.page = false;
		if((state.page && $scope.pin.sortby[0] === oldChunk.sortby)||!state.page||!state.filter) state.sortby = true;
		if(!refresh && state.chunk && state.sortby && state.searchterm && state.page && state.filter && state.playlist.selected && state.playlist.active && state.sources){
			state.get = false;
		}
		if(!state.sortby && self.memory[context][mem].all){
			if(log) console.error('search','reverse')
			this.memory[context][mem].all = self.memory[context][mem].all.reverse();
			this.memory[context][mem].chunks={};
			this.memory[context][mem].scrolltop = 0;
			flags.from = 0;
			state.reversed = true;
		}
		this.state = state;
	}


	search.prototype.setScroll = function(s){
		if(!this.brake) this.memory[context][mem].scrolltop = s;
	}
	search.prototype.go = function(refresh,origin){
		var self = this;
		if($scope.refresh[$scope.pin.Page]){
			refresh = true;
			$scope.refresh[$scope.pin.Page] = 0;
		}

		if(!oldChunk) setOldChunk();
		this.prepare(refresh)
		setOldChunk();
		if(typeof self.memory[context][mem].scrolltop === 'undefined') self.memory[context][mem].scrolltop = 0;

		if(!this.state.get){
			this.fixChrome(true);
			self.goscroll();
			//self.godrawer();
			return;
		}

		this.brake = true;
		$scope.loading = true;
		if(log) console.warn('search',$scope.playlist.active?'playlist':$scope.pin.Page);

		if(self.memory[context][mem].libsize && !refresh){
			$scope.lib.size = self.memory[context][mem].libsize;
			self.fixChrome(true);
			if(!self.state.page||!self.state.playlist.active||!self.state.playlist.selected||self.state.reversed){
				$timeout(function(){
					$('#playwindow').scrollTop(self.memory[context][mem].scrolltop);
				})
			}
		}else{
			$scope.lazy.scroll(0);
			flags.from = 0;
			//$scope.lazy.chunk = 0;
			refresh = true;
		}

		this.refresh = refresh;

		if($scope.pin.Page!=='title'){
			this[$scope.pin.Page]();
			return;
		}
		if($scope.playlist.active){
			this.playlist(flags);
			return;
		}
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
				if(log) console.log('search','refreshing playlist')
				self.playlist(Flags,true);
			},function(err){
				console.error(err)
			})
			return;
		}else{
			$scope.lib.size = tracks.length
			self.memory[context][mem].libsize = tracks.length;
			console.warn(data,Flags)
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
				self.memory[context][mem].all = data;
				if(log) console.log('search','renew "All"')
				self.Search(search,type,flags);
			},function(err){
				console.error('search',err);
			})
		}else{
			self.Search(search,type,flags);
		}
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
				//console.error('search',search,data,Flags);
				self.brake = false;
				$scope.loading = false;
				$scope.$apply(function(){
					self.fixChrome(true);
				})
				//$scope.$apply(function(){self.go()});
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
			self.commit(data.items,type,Flags);

		},function(err){
			if(err) console.error('search',err);
		})
	}
	search.prototype.fixChrome = function(refresh){
		if(!$scope.tracks.all) return;
		$scope.lazy.maxheight = ($scope.tracks.all.length+1)*$scope.dims.trackHeight - $scope.dims.playwindowHeight
		if($scope.lazy.maxheight < $scope.dims.playwindowHeight) $scope.lazy.maxheight = $scope.dims.playwindowHeight;
		if($scope.drawers.dpos[$scope.pin.Page].open) $scope.lazy.maxheight+= $scope.drawers.lib[$scope.pin.Page][$scope.drawers.dpos[$scope.pin.Page].open].height;
		if(refresh) $scope.lazy.fixChrome(this.memory[context][mem].scrolltop);
	}

	search.prototype.commit = function(items,type,Flags){
		if(log) console.log('search','commit('+type+')')
		var self = this;
		items = playpos(items,Flags);
		self.memory[context][mem].chunk = $scope.lazy.chunk;
		$scope.loading = false;
		$scope.lib[$scope.pin.Page] = items;
		if(!$scope.playlist.active){
			$scope.tracks.all = self.memory[context][mem].all;
			if($scope.pin.Page === 'title') self.memory.Title = self.memory[context][mem].all;
		}else{
			$scope.tracks.all = $scope.playlist.activelist[$scope.playlist.selected];
		}

		if($scope.drawers.dpos[$scope.pin.Page].open && $scope.tracks.all.indexOf($scope.drawers.dpos[$scope.pin.Page].open) === -1){
			$scope.drawers.lib[$scope.pin.Page][$scope.drawers.dpos[$scope.pin.Page].open].height = 0;
			$scope.drawers.dpos[$scope.pin.Page].open = false;
			this.refresh = true;
		}

		this.fixChrome(this.refresh);

		$scope.tracks.isInFocus();

		setTimeout(function(){
			$scope.$apply();
			if((!self.state.page||!self.state.playlist.active||!self.state.playlist.selected) && self.refresh){
				setTimeout(function(){
					$('#playwindow').scrollTop(self.memory[context][mem].scrolltop);
					self.brake = false;
					self.goscroll();
					//self.godrawer();

				})
			}else{
				self.brake = false;
				self.goscroll();
				//self.godrawer();
			}
		})

		if(type === 'artist'){
			items.forEach(function(row){
				if(!$scope.lib.bios[row.id]){
					$scope.lib.bios[row.id] = true;
					new wiki(row);
				}
			});
		}
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
	search.prototype.godrawer = function(){
		if(!this.drawer) return;
		$scope.drawers.drawer(this.drawer,true);
		this.drawer = false;
	}
	search.prototype.goscroll = function(){
		if(!this.scrolltop||$scope.pin.Page!=='album'){
			this.scrolltop = false;
			$scope.drawers.ani=false;
			return;
		}
		var self = this;
		if(!$('#playwindow').length){
			alert('retry')
			setTimeout(function(){self.goscroll()},100);
			return;
		}
		var st = $scope.tracks.all.indexOf(this.scrolltop.id)*$scope.lazy.trackHeight;
		this.scrolltop = false;
		$timeout(function(){
			self.godrawer();
		})
		$('#playwindow').stop().animate({scrollTop:(st)},750,'easeOutExpo',function(){
			$scope.$apply(function(){
				self.go(false,'scroll')
			})
		});
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
								console.log(res.description)
							}
						})
					})
					$scope.lib.bios[row.id]={};
					if(!artist){
						console.error('no data: '+row.name)
						return;
					}
					console.warn(artist)
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
				}else{
					console.warn('Nothing found for: '+row.name)
				}
			}
		})
	}
	return search;
}])
