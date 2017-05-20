'use strict'

angular.module('yolk').factory('search',['$timeout',function($timeout) {
	var $scope;
	const tools = require('../../lib/tools/searchtools.js');
	const crypto = require('crypto');
	const Q = require('promise');
	const request = require('request');
	var Memory = false;
	var StateChange = false;

	var search = function(scope){
		$scope = scope;
		this.fields = tools.fields;
		var self = this;
	}


	var oldChunk = {
		playlistSelected:1,
		playlistActive:false
	};
	var flags = {};

	search.prototype.prepare = function(refresh){
		var state={
			chunk:$scope.lazy.chunk === oldChunk.chunk,
			sources:$scope.pin.pinned.sources.length === oldChunk.sources,
			sortby:$scope.pin.sortby[0] === oldChunk.sortby,
			searchterm:$scope.searchTerm === oldChunk.searchTerm,
			filter:$scope.pin.Filter === oldChunk.filter,
			page:$scope.pin.Page === oldChunk.page,
			titlepage:$scope.pin.Page === 'title',
			playing:$scope.lib.playing ? true : false,
			playlist:{
				selected:$scope.playlist.selected===oldChunk.playlistSelected,
				active:$scope.playlist.active===oldChunk.playlistActive
			},
			checkfocus:false,
			get:true
		}
		//abort database lookup if the search was triggered by a scroll only
		if(!refresh && state.chunk && state.sources && state.sourtby && state.searchterm && state.page){
			state.get = false;
		}
		//hack the GUI lookup and refresh if a conent drawer is open
		if($scope.lazy.drawer && $scope.lazy.drawer.chunk < $scope.lazy.chunk && $scope.lazy.drawer.offset > 0){
			state.get = false;
		}

		if(state.playing && (!state.sortby ||!state.searchterm ||!state.sources||!state.filter)){
			state.checkfocus = true;
		}

		if(!$scope.lazy.Step||($scope.searchTerm && !state.searchterm)||($scope.playlist.active && (!state.playlist.selected||!state.playlist.active))){
			$scope.lazy.refresh();
		}

		if(($scope.tracks.all && state.titlepage && !$scope.playlist.active && (!state.sources || !state.searchterm || !state.filter)) || (refresh && state.titlepage)){
			delete $scope.tracks.all
		}else if($scope.tracks.all && !state.sortby){
			$scope.tracks.all = $scope.tracks.all.reverse()
		}
		if(
			(!state.page && $scope.lazy.memory[$scope.pin.Page].scrolltop && !$scope.searchTerm) ||
			(state.page && $scope.lazy.memory[$scope.pin.Page].scrolltop && !$scope.searchTerm && oldChunk.searchTerm) ||
			(state.page && $scope.lazy.memory[$scope.pin.Page].scrolltop && !$scope.searchTerm && !$scope.pin.Filter && oldChunk.filter) ||
			(!$scope.playlist.active && !state.playlist.active)
		){
			Memory = true;
			Object.keys($scope.lazy.memory[$scope.pin.Page]).forEach(function(key){
				if(key === 'scrolltop') return;
				flags[key] = $scope.lazy.memory[$scope.pin.Page][key]
			})
			this.state = state;
			return;
		}else if(!state.page){
			$scope.lazy.refresh()
		}
		flags = {
			size:$scope.lazy.Step*4,
		}
		if($scope.lazy.chunk > 0){
			flags.from = $scope.lazy.Step*($scope.lazy.chunk-1)
		}else{
			flags.from = $scope.lazy.Top
		}
		if(!$scope.searchTerm){
			Object.keys(flags).forEach(function(key){
				$scope.lazy.memory[$scope.pin.Page][key] = flags[key]
			})
		}
		this.state = state;
	}

	search.prototype.album = function(refresh){
		if(this.state && this.state.page && !$scope.searchTerm && !oldChunk.searchTerm && !$scope.pin.Filter && !oldChunk.filter){
			$scope.lazy.memory.album.scrolltop = $('#playwindow').scrollTop();
		}
		flags={};
		this.prepare(refresh)
		if(!this.state.get) return;
		setOldChunk();
		var should = []
		var must = [{bool:{should:should}},{match:{'deleted':$scope.pin.Filter === 'deleted' ? 'yes':'no'}},{match:{youtube:{query:'no',type:'phrase'}}}];
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

		$scope.db.fetch(search).then(function(data){
			$scope.lib.size = data.libsize;
			data.items = playpos(data.items);
			$timeout(function(){
				$scope.tracks.fixChrome();
				$scope.lib.albums = data.items;
				if(refresh){
					$scope.lazy.refresh($('#playwindow').scrollTop())
				}else{
					memory();
				}
			})
		})
	}

	search.prototype.artist = function(refresh){
		if(this.state && this.state.page && !$scope.searchTerm && !oldChunk.searchTerm && !$scope.pin.Filter && !oldChunk.filter){
			$scope.lazy.memory.artist.scrolltop = $('#playwindow').scrollTop();
		}
		flags={};
		this.prepare(refresh)
		if(!this.state.get) return;

		setOldChunk();
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

		$scope.db.fetch(search).then(function(data){
			$scope.lib.size = data.libsize;
			data.items = playpos(data.items);

			$timeout(function(){
				$scope.tracks.fixChrome();
				$scope.lib.artists = data.items;
				if(refresh){
					$scope.lazy.refresh($('#playwindow').scrollTop())
				}else{
					memory();
				}
			})
			data.items.forEach(function(row){
				wiki(row);
			})
		})
	}

	search.prototype.go = function(refresh){
		clearTimeout($scope.refresh_time);
		var self = this;
		switch($scope.pin.Page){
			case 'artist':
				this.artist(refresh);
				return;
			break;
			case 'album':
				this.album(refresh);
				return;
			break
		}
		if(this.state && this.state.page && !this.state.searchTerm && !oldChunk.filter){
			if(!$scope.playlist.active && this.state.playlist.active){
				$scope.lazy.memory.title.scrolltop = $('#playwindow').scrollTop();
			}
		}
		flags={};
		this.prepare(refresh)
		if(!this.state.get) return;
		var scs = ['download','file','id','metadata.*','path','type','artist','album','date','deleted'];
		var search = {index:$scope.db_index,type:'local,internetarchive,youtube',body:{_source:scs,query:{bool:{must:[{bool:{should:[]}}]}}}};
		if(!$scope.playlist.active){
			search.sort=$scope.pin.sortby;
			search.type = $scope.pin.pinned.sources.toString();
			search.body.query.bool.must.push({match:{'deleted':$scope.pin.Filter === 'deleted' ? 'yes':'no'}})
		}else if($scope.playlist.selected === 1){
			search.sort = ["played:desc"]
			search.body.query.bool.must.push({match:{'deleted':'no'}})
		}else{
			search.sort = ["playlist"+$scope.playlist.selected+":asc"];
			search.body.query.bool.must.push({match:{'deleted':'no'}})
		}
		Object.keys(flags).forEach(function(key){
			search[key]=flags[key];
		})
		var terms = false;
		if($scope.searchTerm && $scope.searchTerm.length > 1 && !$scope.playlist.active){
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
		if($scope.playlist && $scope.playlist.active){
			if($scope.playlist.activelist[$scope.playlist.selected].length){
				$scope.playlist.activelist[$scope.playlist.selected].forEach(function(track){
					search.body.query.bool.must[0].bool.should.push({match:{id:{query:track.id,type:'phrase'}}});
				})
			}else{
				search.body.query.bool.must.push({match:{id:{query:"nothing",type:'phrase'}}});
			}
		}
		if(!$scope.tracks.all){
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
				data = data.map(function(id){
					return id.id;
				})
				$scope.tracks.all = data;
				Search();
			},function(err){
				console.error(err);
			})
		}else{
			Search();
		}
		function Search(){
			$scope.db.fetch(search).then(function(data){
				$scope.lib.size = data.libsize;
				data.items = playpos(data.items);
				setOldChunk();
				$timeout(function(){
					$scope.lib.tracks = data.items;
					$scope.tracks.fixChrome();
					if(self.state.checkfocus){
						$scope.tracks.isInFocus();
						//$timeout(function(){
							$scope.lazy.refresh($('#playwindow').scrollTop())
						//})
					}
					memory();
				})
			})
		}
	}

	search.prototype.artistAlbums = function(artist){
		return new Q(function(resolve,reject){
			var must = $scope.tools.wrap.bool([{must:[
				{match:{"metadata.artist.exact":{query:artist.toLowerCase()}}},
				{match:{deleted:{query:'no',type:'phrase'}}}
			]}])
			var query = {index:$scope.db_index,type:"local,internetarchive,youtube",body:{query:must}}
			$scope.db.fetchAll(query).then(function(data){resolve(data)},function(err){reject(err)})
		})
	}

	search.prototype.albumTrack = function(track,album){
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
		return new Q(function(resolve,reject){
			$scope.db.fetchAll(query).then(function(data){
				resolve(data)
			},function(err){
				reject(err)
			})
		})
	}

	//process the query into external searches
	search.prototype.remoteSearch = function(search_id,e){
		if(e && e.which !== 13) return;
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

	var setOldChunk = function(){
		if(oldChunk.filter !== $scope.pin.Filter) StateChange = true;
		//console.log($scope.pin.pinned.sources)
		oldChunk = {
			chunk:$scope.lazy.chunk,
			//sources:$scope.pin.pinned.sources,
			sources:$scope.pin.pinned.sources.length,
			sortby:$scope.pin.sortby[0],
			searchTerm:$scope.searchTerm,
			page:$scope.pin.Page,
			filter:$scope.pin.Filter,
			playlistSelected:$scope.playlist.selected,
			playlistActive:$scope.playlist.active
		}
	}

	var playpos = function(items){
		var count = 0;
		items.map(function(track){
			if(!track.filter){
				track.filter = {};
			}
			track.filter.pos = count+(flags.from*1);
			if(track.filter.pos % 2 == 0){
			  track.filter.zebra='even';
			}else{
			  track.filter.zebra='odd';
			}
			count++;
			return track
		})
		return items;
	}
	var memory = function(){
		if(!$scope.searchTerm && Memory){
			$('#playwindow').scrollTop($scope.lazy.memory[$scope.pin.Page].scrolltop)
			$scope.lazy.refresh($scope.lazy.memory[$scope.pin.Page].scrolltop)
		}else if(StateChange){
			$scope.lazy.refresh();
		}
		Memory = false;
		StateChange = false;
	}

	//look up artist details from wikipedia
	var wikitypes = ['band','singer-songwriter','singer','musician','performer','orchestra','musical act','rapper','composer','group']
	var wiki = function(row){
		if($scope.lib.bios[row.id]) return;
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
				console.error(error);
				return;
			}
			try {
				var result = JSON.parse(body)
			}
			catch(err){
				console.error(err);
				return;
			}

			if(!lookup){
				var bio = result.query.pages[Object.keys(result.query.pages)[0]];
				$scope.lib.bios[row.id].bio = bio.extract;
				$scope.lib.bios[row.id].title = bio.title;
			}else{
				var artist;
				if(result.search.length){
					result.search.some(function(res){
						return wikitypes.some(function(type){
							if(res.description && res.description.toLowerCase().indexOf(type) > -1){
								artist = res.label;
								return true
							}
						})
					})
					$scope.lib.bios[row.id]={};
					if(!artist) return;
					options.uri = "https://en.wikipedia.org/w/api.php?action=query&titles="+$scope.tools.queryBuilder(artist)+"&prop=extracts&exintro=true&explaintext=true&redirects=true&format=json";
					request.get(options,function(error, response, body){
						if(error){
							console.error(error);
							return;
						}
						try {
							var result = JSON.parse(body)
						}
						catch(err){
							console.error(err);
							return
						}
						var bio = result.query.pages[Object.keys(result.query.pages)[0]];
						if(bio){
							//$timeout(function(){
							$scope.lib.bios[row.id].bio = bio.extract;
							$scope.lib.bios[row.id].title = bio.title;
							//})
						}
					})
				}
			}
		})
	}

	return search;
}])
