'use strict'

angular.module('yolk').factory('pin',['$timeout',function($timeout) {
	var $scope;
	var pin = function(scope){
		$scope = scope;
		this.pinned = {
			sources:['local','internetarchive','youtube'],
		};
		this.direction = {
			title:'asc',
			artist:'asc',
			album:'asc'
		}
		this.Page = 'title';
		this.sortby = ['metadata.title.raw:'+this.direction[this.Page]];
		this.scroll={
			title:0,
			artist:0,
			album:0
		}
		/*
		$scope.pinned = {
			sources:[],
			oldSources:['local','online']
		};
		$scope.sources = [];
		*/
	}
	pin.prototype.source = function(name){
		if(this.pinned.sources.indexOf(name) > -1){
			if(this.pinned.sources.length > 1){
				this.pinned.sources = this.pinned.sources.filter(function(source){
					if(source!==name){
						return true;
					}
				})
			}

		}else{
			this.pinned.sources.push(name);
		}
		$scope.search.go(false,true);
	}
	pin.prototype.artist = function(name){
		this.pinned.album=false;
		this.pinned.artist ? this.pinned.artist = false:this.pinned.artist = name
		$scope.search.go();
	}
	pin.prototype.album = function(name){
		this.pinned.artist=false;
		this.pinned.album ? this.pinned.album = false:this.pinned.album = name;
		$scope.search.go();
	}
	pin.prototype.page = function(page,skip){
		if(this.Page === page && !skip){
			this.direction[page] === 'asc' ? this.direction[page] = 'desc':this.direction[page] = 'asc';
		}
		this.Page = page;
		switch (page){
			case 'title':
				this.sortby = this.Filter ? ['date:'+this.direction[page]]:['metadata.title.raw:'+this.direction[page]];
				$scope.search.go(false,true);
			break;
			case 'artist':
				this.sortby = this.Filter ? ['date:'+this.direction[page]]:['name.raw:'+this.direction[page]];
				$scope.search.artist(false,true);
			break;
			case 'album':
				this.sortby = this.Filter ? ['date:'+this.direction[page]]:['metadata.title.raw:'+this.direction[page]];
				$scope.search.album(false,true);
			break;
		}
	}
	pin.prototype.filter = function(filter){
		this.Filter === filter ? this.Filter = false:this.Filter = filter;
		this.page(this.Page,true);
	}
	pin.prototype.tracks = function(artist,album){
		$scope.searchTerm = "artist:"+artist+" album:"+album;
		this.scroll.title = 0;
		this.pinned.artist = false;
		this.pinned.album = false;
		this.page('title')
	}
	return pin;
}])
