'use strict'

angular.module('yolk').factory('search',['$timeout',function($timeout) {
	var $scope;
	const tools = require('../../lib/tools/searchtools.js');
	const crypto = require('crypto');
	const Q = require('promise');
	const request = require('request');

	var search = function(scope){
		$scope = scope;
		this.fields = tools.fields;

		var self = this;
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
				//$timeout.cancel($scope.iaTimer);
				//$timeout.cancel($scope.ytTimer);
				searchTime = $timeout(function(){
					self.go();
				},500);
			}
		});
	}
	search.prototype.clear = function(){
		$timeout(function(){
			$scope.searchTerm = '';
			$('#search input').focus();
		})
	}


	//process the search term into a database query string
	search.prototype.searchString = function(term,pre){

		if(!pre){
			pre='metadata';
		}
		var self = this;
		var q='(';
		var terms = {};


		var prefix = tools.clean(term);
		this.fields.filter(function(field){
			if(term.split(field+':')[1]){
				terms[field] = tools.clean(term.split(field+':')[1]);
			};
		});
		for(var term in terms){
			if(terms[term]){
				var fuzz = tools.fuzzy(terms[term]);
				q=q+pre+'.'+term+':"'+fuzz+'" AND ';
			}
			//console.log(q);
		}
		q=q.trim();
		q=q.split(' ');
		if(q[q.length -1] === 'AND'){
			q.pop();
		}
		q = q.join(" ");
		q=q+") "
		if(q ==='() '){
			q='';
		}
		if(prefix.length){
			var fields = ['title','artist','album','description'];
			var term = tools.fuzzy(prefix);
			fields.forEach(function(field){
				q=q+pre+'.'+field+':"'+term+'" ';
			})
			q=q+'description:"'+term+'"';
		}
		return q;
	}

	var oldChunk = {
		pinned:{},
		sortby:{}
	};
	var flags = {};
	var prepare = function(next,refresh){
		/*
		console.log($scope.pin.sortby)
		console.log(!next)
		console.log(!refresh)
		console.log($scope.lazy.chunk===oldChunk.chunk)
		console.log($scope.pin.pinned.sources === oldChunk.sources)
		console.log($scope.pin.pinned.artist === oldChunk.pinned.artist)
		console.log($scope.pin.pinned.album === oldChunk.pinned.album)
		console.log($scope.pin.sortby.dir === oldChunk.sortby.dir)
		console.log($scope.pin.sortby.field === oldChunk.sortby.field)
		console.log($scope.pin.sortby.term === oldChunk.sortby.term)
		console.log($scope.searchTerm === oldChunk.searchTerm)
		console.log('-----------------------------------------')
		*/
		//return if the search was triggered by a scroll only
		if(
			!next &&
			!refresh &&
			$scope.lazy.chunk === oldChunk.chunk &&
			$scope.pin.pinned.sources === oldChunk.sources &&
			$scope.pin.pinned.artist === oldChunk.pinned.artist &&
			$scope.pin.pinned.album === oldChunk.pinned.album &&
			$scope.pin.sortby === oldChunk.sortby &&
			$scope.searchTerm === oldChunk.searchTerm
		){
			return false;
		}


		if(!$scope.lazy.Step){
			$scope.lazy.refresh();
		}

		flags = {
			size:$scope.lazy.Step*4,
		}
		if($scope.lazy.chunk > 0){
			flags.from = $scope.lazy.Step*($scope.lazy.chunk-1)
		}else{
			flags.from = $scope.lazy.Top
		}
		return true;
	}
	var setOldChunk = function(){

		oldChunk = {
			chunk:$scope.lazy.chunk,
			pinned:{
				artist:$scope.pin.pinned.artist,
				album:$scope.pin.pinned.album
			},
			sources:$scope.pin.pinned.sources,
			sortby:$scope.pin.sortby,
			searchTerm:$scope.searchTerm
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

	search.prototype.album = function(next,refresh){
		flags={};
		if(!prepare(next,refresh)){
			return;
		}
		if(!next){
			setOldChunk();
		}
		var search = {
			index:$scope.db_index,
			type:['albums'],
			sort:$scope.pin.sortby,
			body:{
				query:{
					bool:{
						must:[
							{match:{'deleted':$scope.pin.Filter === 'deleted' ? 'yes':'no'}},
						]
					}

				}
			}
		}
		if($scope.pin.pinned.album){
			search.body.query.bool.must.unshift({match:{'metadata.title.exact':$scope.pin.pinned.album}})
		}
		if($scope.pin.pinned.artist){
			search.body.query.bool.must.unshift({match:{'metadata.artist.exact':$scope.pin.pinned.artist}})
		}
		Object.keys(flags).forEach(function(key){
			search[key]=flags[key];
		})
		//$scope.db.fetch($scope.db_index,['albums'],false,flags).then(function(data){
		$scope.db.fetch(search).then(function(data){
			$scope.lazy.libSize = data.libsize;
			data.items = playpos(data.items);
			$scope.lazy.refresh($('#playwindow').scrollTop());
			$timeout(function(){
				$scope.tracks.fixChrome(data.libsize);
				$scope.lib.albums = data.items;
			})

		})
	}
	search.prototype.artist = function(next,refresh){

		flags={};
		if(!prepare(next,refresh)){
			return;
		}

		if(!next){
			setOldChunk();
		}
		var search = {
			index:$scope.db_index,
			type:['artists'],
			sort:$scope.pin.sortby,
			body:{
				query:{
					bool:{
						must:[
							{match:{'deleted':$scope.pin.Filter === 'deleted' ? 'yes':'no'}},
						]
					}

				}
			}
		}
		if($scope.pin.pinned.artist){
			search.body.query.bool.must.unshift({match:{'name.exact':$scope.pin.pinned.artist}})
		}
		Object.keys(flags).forEach(function(key){
			search[key]=flags[key];
		})

		//$scope.db.fetch($scope.db_index,['artists'],false,flags).then(function(data){
		$scope.db.fetch(search).then(function(data){
			$scope.lazy.libSize = data.libsize;

			data.items = playpos(data.items);

			$scope.lazy.refresh($('#playwindow').scrollTop());
			$timeout(function(){
				$scope.tracks.fixChrome(data.libsize);
				$scope.lib.artists = data.items;
				data.items.forEach(function(row){

					if(row.links && row.links.wikipedia && !$scope.lib.bios[row.id]){
						$scope.lib.bios[row.id]={}
						var wid = path.basename(row.links.wikipedia);
						var query = "https://en.wikipedia.org/w/api.php?action=query&titles="+wid+"&prop=extracts&exintro=true&explaintext=true&format=json";
						var headers = Yolk.modules["musicPlayer"].config.headers
						var options={
							headers:{
								'User-Agent':headers['User-Agent']
							},
							uri:query
						};
						request.get(options,function(error, response, body){
							var result = JSON.parse(body)
							var bio = result.query.pages[Object.keys(result.query.pages)[0]];
							$timeout(function(){
								$scope.lib.bios[row.id].bio = bio.extract;
								$scope.lib.bios[row.id].title = bio.title;
							})

						})
					}
				})
			})
		})
	}
	search.prototype.go = function(next,refresh){
		switch($scope.pin.Page){
			case 'artist':
				this.artist(next,refresh);
				return;
			break;
			case 'album':
				this.album(next,refresh);
				return;
			break
		}
		flags={};
		if(!prepare(next,refresh)){
			return;
		}

		if(next){
			flags.size = 1,
			flags.from = next
		}
		/*
		if($scope.lib.playing && !next){
			$scope.lib.playing.query = q;
			$scope.lib.playing.flags = flags;
		}
		*/
		//if the search was triggered by a change in track scope, check if the playing track is still in scope
		if(!next && $scope.lib.playing && (
				$scope.pin.pinned.artist !== oldChunk.pinned.artist ||
				$scope.pin.pinned.album !== oldChunk.pinned.album ||
				$scope.pin.sortby !== oldChunk.sortby ||
				$scope.searchTerm !== oldChunk.searchTerm ||
				$scope.pin.pinned.sources !== oldChunk.sources ||
				refresh
			)
		){

			$scope.tracks.isInFocus();
		}

		if(!next){
			setOldChunk();
		}
		var search = {
			index:$scope.db_index,
			type:$scope.pin.pinned.sources.toString(),
			sort:$scope.pin.sortby,
			body:{
				query:{
					bool:{
						must:[
							{match:{'deleted':$scope.pin.Filter === 'deleted' ? 'yes':'no'}},
						]
					}

				}
			}
		}
		if($scope.pin.pinned.artist){
			search.body.query.bool.must.unshift({match:{'metadata.artist.exact':$scope.pin.pinned.artist}})
		}
		if($scope.pin.pinned.album){
			search.body.query.bool.must.unshift({match:{'metadata.album.exact':$scope.pin.pinned.album}})
		}
		Object.keys(flags).forEach(function(key){
			search[key]=flags[key];
		})

		if($scope.searchTerm && $scope.searchTerm.length > 1){
			delete search.sort;
			search.body.query.bool.must.push({
				multi_match:{
					query:$scope.searchTerm,
					operator : "and",
					fuzziness:'auto',
					fields:['metadata.title','metadata.artist^10','metadata.album^5'],
				}
			})
			/*
			var more = this.searchString($scope.searchTerm);
			console.log(more)
			if(more.length){
				q=q+' AND (';
				q = q + more + ')';
			}
			*/
		}

		//$scope.db.fetch($scope.db_index,$scope.pin.pinned.sources,q,flags).then(function(data){
		$scope.db.fetch(search).then(function(data){
			if(!next){
				$scope.lazy.libSize = data.libsize;
			}else{
				res(data.items);
				return;
			}


			data.items = playpos(data.items);
			$scope.lazy.refresh($('#playwindow').scrollTop());
			$timeout(function(){
				$scope.tracks.fixChrome(data.libsize);
				$scope.lib.tracks = data.items;
			})

		})
		if(next){
			var res;
			return new Q(function(resolve,reject){
				res = function(data){
					resolve(data);
				}
			})
		}
	}
	search.prototype.artistAlbums = function(artist){
		return new Q(function(resolve,reject){
			artist = tools.sanitise(artist);
			//var query = '(_type:local OR _type:internetarchive OR _type:youtube) AND metadata.artist:"'+artist+'"';
			var query = {
				index:$scope.db_index,
				type:"local,internetarchive,youtube",
				body:{
					query:{
						constant_score: {
							filter: {
								term: { "metadata.artist.exact":artist }
							}
						}
					}
				}
			}
			$scope.db.fetchAll(false,false,false,query).then(function(data){
				resolve(data)
			},function(err){
				reject(err)
			})
		})
	}
	search.prototype.albumTrack = function(track,album){

		var query = {
			index:$scope.db_index,
			type:"local,internetarchive,youtube",
			body:{
				query:{
					bool:{
						must:[
							{match:{'deleted':'no'}},
							{match:{'metadata.title':{
									query:track.title,
									operator:'and',
									fuzziness:'auto'
								}
							}},
							{bool:{
								should:[
									{match:{'metadata.artist':{
											query:track.artist,
											operator:'and',
											fuzziness:'auto'
										}
									}},
									{match:{'metadata.artist':{
											query:album.artist,
											operator:'and',
											fuzziness:'auto'
										}
									}},
									{match:{'metadata.album':{
											query:album.title,
											operator:'and',
											fuzziness:'auto',
											boost:20
										}
									}}
								]
							}}
						]
					}

				}
			}
		}
		return new Q(function(resolve,reject){

			//var Artist = tools.sanitise(track.artist);
			//var Album = tools.sanitise(album);
			//var Track = tools.sanitise(track.title);

			//var query = '(_type:local _type:internetarchive _type:youtube musicbrainz_id:"'+track.id+'" metadata.album:"'+Album+'") AND (metadata.title:"'+Track+'" AND  metadata.artist:"'+Artist+'")';
			//$scope.db.fetchAll($scope.db_index,query).then(function(data){
			$scope.db.fetchAll(query).then(function(data){
				resolve(data)
			},function(err){

				reject(err)
			})
		})
	}
	//process the query into external searches
	search.prototype.remoteSearch = function(search_id,e){

		if(e && e.which !== 13){
			return;
		}

		if($scope.pin.pinned.sources.indexOf('online')===-1){
			$scope.pin.source('online');
		}
		if($scope.pin.pinned.sources.indexOf('youtube')===-1){
			$scope.pin.source('youtube');
		}
		var search_id = crypto.createHash('sha1').update(search_id).digest('hex');
		var sources = $scope.pin.pinned.sources.filter(function(source){
			if(source!=='local'){
				return true;
			}
		})
		sources.forEach(function(source){
			if($scope[source]&&$scope[source].search){
				$scope[source].search($scope.searchTerm);
			}
		})
		/*
		if(sources.length){
			this.search_id = search_id;
			var self = this;
			$scope.db.client.get({
				index:$scope.db_index,
				type:'searches',
				id:search_id
			},function(err,data){
				$scope.goSearch = false;
				if(err){
					var body={};
					body.time = {};
					sources.forEach(function(source){
						if(source!=='local'){
							body.time[source]= Date();
							Tools.remote_search(source);
						}
					})
					$scope.db.put($scope.db_index+'.searches.'+search_id,body).then(function(data){
						//console.log(data);
					},function(err){
						console.log(err);
					})
				}else{

					sources.forEach(function(source){
						if(data._source.time[source]){
							if($scope.utils.dateDiff(Date(),data._source.time[source],'minutes') > 10){
								Tools.remote_search(source);
								Tools.update(source,self.search_id);
							}else{
								console.log($scope.utils.dateDiff(Date(),data._source.time[source],'minutes'))
							}
						}else{
							Tools.remote_search(source);
							Tools.update(source,self.search_id);
						}
					})
				}
			})
		}
		*/
	}
	/*
	var Tools = {
		remote_search:function(source){

			if($scope[source]&&$scope[source].search){
				$scope[source].search($scope.searchTerm);
			}
		},
		update:function(type,id){
			var body = {};
			body.time = {};
			body.time[type]=Date();
			$scope.db.update($scope.db_index+'.searches.'+id,body).then(function(data){
				//console.log('updated')
				//console.log(data);
			})
		}
	}
	*/
	return search;
}])
