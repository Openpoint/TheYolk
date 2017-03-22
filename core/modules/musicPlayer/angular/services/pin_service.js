'use strict'

var oldterms = {};
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
		$scope.search.go(true);

	}
	pin.prototype.pinner = function(name,type){
		var terms = $scope.tools.terms($scope.searchTerm)
		if(this.pinned[type] === name){
			delete oldterms[type]
			delete terms[type]
		}else{
			terms[type] = name
		}
		var newsearch = ""

		Object.keys(terms).forEach(function(key){
			if(key !== 'prefix') newsearch += key+':'+terms[key]+' '
		})
		newsearch = ((terms.prefix||'')+' '+newsearch).trim();
		$scope.searchTerm = newsearch
	}
	pin.prototype.prefix = function(name){
		this.pinner(name,'prefix')
	}
	pin.prototype.artist = function(name){
		this.pinner(name,'artist')
	}
	pin.prototype.album = function(name){
		this.pinner(name,'album')
	}
	pin.prototype.title = function(name){
		this.pinner(name,'title')
	}
	pin.prototype.clear = function(){
		oldterms = {};
		$timeout(function(){
			$scope.searchTerm = '';
			$('#search input').focus();
		})
	}
	pin.prototype.page = function(page,skip){

		var newterm = '';
		var terms = $scope.tools.terms($scope.searchTerm);

		if(terms.prefix) newterm = terms.prefix;
		if(terms.artist) newterm+=' artist:'+terms.artist;

		if((terms.album||oldterms.album) && page!=='artist') newterm+=' album:'+(terms.album||oldterms.album);
		if(terms.album && page==='artist') oldterms.album = terms.album;

		if((terms.title||oldterms.title) && page!=='album' && page!=='artist') newterm+=' title:'+(terms.title||oldterms.title);
		if(terms.title && (page==='album'||page==='artist')) oldterms.title = terms.title;

		$scope.searchTerm = newterm.trim()

		if(this.Page === page && !skip){
			this.direction[page] === 'asc' ? this.direction[page] = 'desc':this.direction[page] = 'asc';
			$scope.lazy.refresh()
		}
		this.Page = page;
		switch (page){
			case 'title':
				this.sortby = this.Filter ? ['date:'+this.direction[page]]:['metadata.title.raw:'+this.direction[page]];
				$scope.search.go();
			break;
			case 'artist':
				this.sortby = this.Filter ? ['date:'+this.direction[page]]:['name.raw:'+this.direction[page]];
				$scope.search.go();
			break;
			case 'album':
				this.sortby = this.Filter ? ['date:'+this.direction[page]]:['metadata.title.raw:'+this.direction[page]];
				$scope.search.go();
			break;
		}
	}
	pin.prototype.filter = function(filter){
		this.Filter === filter ? this.Filter = false:this.Filter = filter;
		this.page(this.Page,true);
	}
	pin.prototype.tracks = function(artist,album,destination){
		delete oldterms.title
		$scope.searchTerm = "artist:"+artist+" album:"+album;
		this.page(destination)
	}
	return pin;
}])
