'use strict'

angular.module('yolk').factory('playlist',['$timeout',function($timeout) {
	var $scope;

	var playlist = function(scope){
		$scope = scope;
		var self = this;

		$scope.db.client.get({
			index:$scope.db_index,
			type:'playlists',
			id:0
		},function(error,response){

			if(response._source){
				self.active = false;
				self.options = response._source.options;
				self.unique = response._source.unique;
				self.selected = 1;
				self.new = null;
				self.activelist = {1:[]};
			}else{
				self.active = false;
				self.options = [{id:1,name:'Recently Played'}];
				self.unique = 2;
				self.selected = 1;
				self.new = null;
				self.updatePlaylist(0);
				self.updatePlaylist(1,[]);
				self.activelist = {1:[]};
			}
		})
	}
	playlist.prototype.toggle=function(){
		$scope.playlist.active ? $scope.playlist.active=false:$scope.playlist.active=true;
		if(!this.activelist[self.selected]) {
			this.change()
		}else{
			$scope.search.go(true)
		}

	}
	playlist.prototype.change = function(){
		var self = this;
		$scope.db.client.get({index:$scope.db_index,type:'playlists',id:this.selected},function(error,data){
			if(error){
				console.error(error);
				return;
			}
			console.log(data)
			self.activelist[self.selected] = data._source.ids
			$scope.search.go(true)
		})

	}
	playlist.prototype.addPlaylist = function(playlist,e){
		var self = this;
		if(e && e!=='add' && e.which !== 13){
			return;
		}else{
			self.options.push({id:self.unique,name:playlist});
			self.selected=$scope.playlist.options[$scope.playlist.options.length-1].id;
			self.new = null;
			console.log(self.unique)
			self.updatePlaylist(self.unique,[]);
			self.unique++;
			self.updatePlaylist(0);
			$scope.search.go(true);
		}
	}
	playlist.prototype.deletePlaylist = function(){
		if(!this.selected) return;
		var indx;
		$scope.playlist.options.some(function(opt,index){
			if(opt.id === $scope.playlist.selected){
				indx = index;
				return true;
			}
		})
		this.options.splice(indx, 1);
		this.selected = 1;
		this.updatePlaylist();
		$scope.search.go(true);
	}
	playlist.prototype.renamePlaylist = function(){
		var self = this;
		if(!this.selected) return;
		var indx;
		$scope.playlist.options.some(function(opt,index){
			if(opt.id === $scope.playlist.selected){
				indx = index;
				return true;
			}
		})
		this.options[indx].name = this.new;
		this.new = null;
		this.updatePlaylist();
	}
	playlist.prototype.updatePlaylist = function(id,tracks){
		console.log(id)
		var self = this;
		if (id === 0){
			var doc = {options:self.options,unique:self.unique}
		}else{
			var doc = {ids:tracks}
		}
		$scope.db.client.update({
		  index: $scope.db_index,
		  type: 'playlists',
		  id:id,
		  refresh:true,
		  doc_as_upsert:true,
		  body: {
			doc:doc
		  }
		}, function (error, response) {
			if (error) console.error(error);
			console.log(response)
		})
	}
	playlist.prototype.handleDragStart=function(event,data){

	}
	playlist.prototype.onDrop = function(event,data){
		this.activelist[this.selected].push(data.id);
		this.updatePlaylist(this.selected,this.activelist[this.selected]);
	}
	return playlist;
}])
