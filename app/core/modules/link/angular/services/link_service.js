"use strict"

angular.module('yolk').factory('link',[function() {
	const BrowserWindow = Yolk.remote('BrowserWindow');
	const path = require('path');
	var $scope;

	var link=function(scope){
		$scope = scope;
		this.widgets = [];
		var self = this;
		$scope.db.client.get({index:$scope.db_index,type:'links',id:0},function(err,data){
			if(err && err.status !== 404) console.error(err)
			if(!data.found){
				$scope.db.client.create({index:$scope.db_index,type:'links',id:0,body:{links:[]}},function(err,data){
					if(err) console.error(err);
					self.populate();
				})
				return;
			}
			$scope.$apply(function(){
				self.widgets = data._source.links.filter(function(w,index,original){
					var i;
					original.some(function(w2,index){
						if(w2.url === w.url){
							i = index;
							return true;
						}
						return false;
					})
					return i === index;
				});
				self.populate();
			})
		})

	}

	link.prototype.get = function(url){
		var self = this;
		return new Promise(function(resolve,reject){
			if(self.widgets.some(function(link){
				return link.url === url
			})){
				resolve(true);
				return;
			}
			var win = new BrowserWindow({
			    parent:Yolk.remote('win'),
			    show:false,
				webPreferences:{
				  nodeIntegration: false,
				  webSecurity: true,
				  preload:path.join(Yolk.root,'core/modules/link/lib/tools/scraper.js')
				}
			});
			win.loadURL(url);
			//win.webContents.openDevTools();
			win.webContents.on('dom-ready',function(){
				win.webContents.executeJavaScript('Yolk_scrape()').then(function(data){
					win.destroy();
					$scope.$apply(function(){
						data.title = $("<textarea/>").html(data.title).text();
						self.widgets.push({title:data.title,icon:data.icon,url:url});
						self.save();
					});
					resolve(true)
				})
			}).on('did-fail-load',function(err){
				win.destroy();
				resolve(false);
			})
		})
	}
	link.prototype.delete = function(url){
		this.widgets = this.widgets.filter(function(link){
			return link.url !== url;
		});
		this.save()
	}
	link.prototype.save = function(){
		this.populate();
		$scope.db.client.update({index:$scope.db_index,type:'links',id:0,body:{doc:{links:this.widgets}},refresh:true},function(err,data){
			if(err) console.error(err);
		})
	}
	link.prototype.populate = function(){
		var self = this;
		if(!this.widgets.length){
			['http://openpoint.ie','http://pasture.openpoint.ie','http://imager.buzz','http://story.openpoint.ie'].forEach(function(url){
				self.get(url)
			})
		}
	}
	return link;
}])
