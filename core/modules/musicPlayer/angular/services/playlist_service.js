'use strict'

angular.module('yolk').factory('playlist',[function() {
	var $scope;

	var playlist = function(scope){
		$scope = scope;
		var self = this;
		this.renew = {1:false};
		$scope.db.client.get({
			index:$scope.db_index,
			type:'playlists',
			id:0
		},function(error,response){
			self.active = false;
			self.selected = 1;
			self.new = null;
			if(response._source){
				self.options = response._source.options;
				self.unique = response._source.unique;
				self.activelist = {}
				self.change();

			}else{
				self.active = false;
				self.options = [{id:1,name:'Recently Played'}];
				self.unique = 2;
				self.activelist = {1:[]};
				self.updatePlaylist(0);
				self.updatePlaylist(1,[]);
			}
		})
	}
	playlist.prototype.toggle=function(){
		this.active ? this.active=false:this.active=true;
		if($scope.pin.Page!=='title'){
			$scope.pin.Page ='title'
		}
		if(!self.selected && this.active) self.selected = 1;
		$scope.search.go(false,'playlist togggle');
	}
	playlist.prototype.change = function(){
		var self = this;
		this.options.some(function(opt){
			if (opt.id === self.selected){
				self.name = opt.name;
				return true;
			}
		})
		$scope.db.client.get({index:$scope.db_index,type:'playlists',id:this.selected},function(error,data){
			if(error){
				console.error(error);
				return;
			}
			self.activelist[self.selected] = data._source.ids
			if($scope.playlist.active) $scope.search.go(false,'playlist change')
		})

	}
	playlist.prototype.addPlaylist = function(playlist,e){
		var self = this;
		if(e && e!=='add' && e.which !== 13){
			return;
		}else{
			self.options.push({id:self.unique,name:playlist});
			self.selected=$scope.playlist.options[$scope.playlist.options.length-1].id;
			if(!self.renew[self.selected]) self.renew[self.selected]=false;
			self.new = null;
			var body = {properties:{}}
			body.properties['playlist'+self.selected]={type:'integer'};
			var types=["internetarchive","local","youtube"]
			types.forEach(function(type,index){
				$scope.db.client.indices.putMapping({index:$scope.db_index,type:type,body:body},function(err,data){
					if(err) console.error(err);
					if(index!==2) return;
					self.updatePlaylist(self.unique,[]);
					self.unique++;
					self.updatePlaylist(0);
					$scope.search.go(false,'playlist added');
				})
			})
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
		this.updatePlaylist(0);
		$scope.search.go(false,'playlist deleted');
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
		this.updatePlaylist(0);
	}
	playlist.prototype.updatePlaylist = function(id,tracks){
		var self = this;
		if (id === 0){
			var doc = {options:self.options,unique:self.unique}
		}else{
			if(!self.activelist[id]) self.activelist[id]=[];
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
		})
	}
	playlist.prototype.remove = function(id){
		this.activelist[this.selected] = this.activelist[this.selected].filter(function(track){
			return track.id!==id
		})
		this.updatePlaylist(this.selected,this.activelist[this.selected]);
		$scope.search.go(false,'playlist track removed');
	}
	playlist.prototype.handleDragStart=function(event,data){
		if(this.active && this.selected!==1){
			this.reorder = data.id;
		}
	}
	playlist.prototype.onDrop = function(event,data){
		if(this.activelist[this.selected].some(function(track){
			return track.id === data.id;
		})){
			return;
		}
		this.activelist[this.selected].push({id:data.id,type:data.type});
		this.updatePlaylist(this.selected,this.activelist[this.selected]);
		$scope.playlist.renew[this.selected]=true;
		this.positions();
	}
	playlist.prototype.onReorder = function(event,data,target){
		var pos={}
		this.activelist[this.selected].forEach(function(track,index){
			if(track.id===data.id) pos.old = index;
			if(track.id===target) pos.new = index;
		})

		if(pos.new > pos.old){
			this.activelist[this.selected].splice(pos.new+1,0,{id:data.id,type:data.type})
			this.activelist[this.selected].splice(pos.old,1)
		}else{
			this.activelist[this.selected].splice(pos.old,1)
			this.activelist[this.selected].splice(pos.new,0,{id:data.id,type:data.type})
		}
		this.updatePlaylist(this.selected,this.activelist[this.selected])
		$scope.playlist.renew[this.selected]=true;
		this.positions(true);

	}
	playlist.prototype.positions=function(update){
		var self = this;
		var count = 0;
		var bulk = [];
		this.activelist[this.selected].forEach(function(track,index){
			var doc = {};
			doc["playlist"+self.selected] = index;
			bulk.push({update:{_index:$scope.db_index,_type:track.type,_id:track.id}})
			bulk.push({doc:doc});
		});
		$scope.db.client.bulk({body:bulk,refresh:true},function(err){
			if(err){
				console.error(err);
				return;
			}
			if($scope.playlist.active) $scope.search.go(true,'playlist positions');
		})
	}
	return playlist;
}])