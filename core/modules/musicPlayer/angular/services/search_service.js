'use strict'

angular.module('yolk').factory('search',['$timeout',function($timeout) {
	var $scope;
	const tools = require('../../lib/tools/searchtools.js');
	const crypto = require('crypto');
	const Q = require('promise');

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
		console.log(!next)
		console.log(!refresh)
		console.log($scope.lazy.chunk===oldChunk.chunk)
		console.log($scope.sources === oldChunk.sources)
		console.log($scope.pinned.artist === oldChunk.pinned.artist)
		console.log($scope.pinned.album === oldChunk.pinned.album)
		console.log($scope.sortby.dir===oldChunk.sortby.dir)
		console.log($scope.sortby.field===oldChunk.sortby.field)
		console.log($scope.sortby.term===oldChunk.sortby.term)
		console.log($scope.searchTerm===oldChunk.searchTerm)
		*/
		//return if the search was triggered by a scroll only
		if(
			!next &&
			!refresh &&
			$scope.lazy.chunk === oldChunk.chunk &&
			$scope.sources === oldChunk.sources &&
			$scope.pinned.artist === oldChunk.pinned.artist &&
			$scope.pinned.album === oldChunk.pinned.album &&
			$scope.sortby.dir === oldChunk.sortby.dir &&
			$scope.sortby.field === oldChunk.sortby.field &&
			$scope.sortby.term === oldChunk.sortby.term &&
			$scope.searchTerm === oldChunk.searchTerm
		){
			return false;
		}


		if(!$scope.lazy.Step){
			$scope.lazy.refresh();
		}

		flags = {
			sort:$scope.sortby,
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
				artist:$scope.pinned.artist,
				album:$scope.pinned.album
			},
			sources:$scope.sources,
			sortby:{
				field:$scope.sortby.field,
				dir:$scope.sortby.dir,
				term:$scope.sortby.term
			},
			searchTerm:$scope.searchTerm
		}
	}

	var playpos = function(items){
		var count = 0;
		items.map(function(track){
			if(!track.filter){
				track.filter = {};
			}
			track.filter.pos = count+flags.from;
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
		flags.sort = [{
			dir:'asc',
			field:'raw',
			term:'metadata.artist'
		},{
			dir:'asc',
			field:'raw',
			term:'metadata.title'
		}]

		if(!next){
			setOldChunk();
		}
		$scope.db.fetch($scope.db_index,['albums'],false,flags).then(function(data){
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

		flags.sort=[{
			dir:'asc',
			field:'raw',
			term:'name'
		}]
		if(!next){
			setOldChunk();
		}
		$scope.db.fetch($scope.db_index,['artists'],false,flags).then(function(data){
			$scope.lazy.libSize = data.libsize;
			data.items = playpos(data.items);
			$scope.lazy.refresh($('#playwindow').scrollTop());
			$timeout(function(){
				$scope.tracks.fixChrome(data.libsize);
				$scope.lib.artists = data.items;
			})

		})
	}
	search.prototype.go = function(next,refresh){
		flags={};
		if(!prepare(next,refresh)){
			return;
		}

		if(next){
			flags.size = 1,
			flags.from = next
		}

		if(!$scope.lib.deleted){
			var q = 'deleted:"no" ';
			//q=q+') AND deleted:"no")'
		}else{
			var q = 'deleted:"yes" ';
			//q=q+') AND deleted:"yes")'
		}

		if($scope.pinned.artist){
			q=q+' AND metadata.artist:"'+$scope.pinned.artist+'"'
		}
		if($scope.pinned.album){
			q=q+' AND metadata.album:"'+$scope.pinned.album+'"'
		}
		if($scope.searchTerm && $scope.searchTerm.length > 1){
			var more = this.searchString($scope.searchTerm);

			if(more.length){
				q=q+' AND (';
				q = q + more + ')';
			}
		}
		if($scope.lib.playing && !next){
			$scope.lib.playing.query = q;
			$scope.lib.playing.flags = flags;
		}


		//if the search was triggered by a change in track scope, check if the playing track is still in scope
		if(!next && $scope.lib.playing && (
				$scope.pinned.artist !== oldChunk.pinned.artist ||
				$scope.pinned.album !== oldChunk.pinned.album ||
				$scope.sortby.dir !== oldChunk.sortby.dir ||
				$scope.sortby.field !== oldChunk.sortby.field ||
				$scope.sortby.term !== oldChunk.sortby.term ||
				$scope.searchTerm !== oldChunk.searchTerm ||
				$scope.sources !== oldChunk.sources ||
				refresh
			)
		){
			$scope.tracks.isInFocus();
		}

		if(!next){
			setOldChunk();
		}

		$scope.db.fetch($scope.db_index,$scope.sources,q,flags).then(function(data){
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

	//process the query into external searches
	search.prototype.remoteSearch = function(search_id,e){

		if(e && e.which !== 13){
			return;
		}

		if($scope.pinned.sources.indexOf('online')===-1){
			$scope.pin.pin('source','online');
		}
		var search_id = crypto.createHash('sha1').update(search_id).digest('hex');
		var sources = $scope.sources.filter(function(source){
			if(source!=='local'){
				return true;
			}
		})

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
	}
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

	return search;
}])
