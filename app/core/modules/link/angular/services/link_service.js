"use strict"

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

angular.module('yolk').factory('link',[function() {
	const BrowserWindow = Yolk.remote('BrowserWindow');
	const path = require('path');
	var $scope;
	var portf=["http://pasture.openpoint.ie","http://imager.buzz","http://drawout.openpoint.ie","http://city.openpoint.ie","http://aesop.openpoint.ie","http://film.limerick.ie","http://smatertravel.limerick.ie","http://dancelimerick.ie"];

	var link=function(scope){
		$scope = scope;
		this.widgets = [];
		this.port = [];
		var self = this;
		//this.load('port')
		this.populate();
		this.load('widgets')
	}
	link.prototype.load = function(type){
		var self = this;
		$scope.db.client.get({index:$scope.db_index,type:'links',id:type},function(err,data){
			if(err && err.status !== 404) console.error(err)

			if(!data.found){
				$scope.db.client.create({index:$scope.db_index,type:'links',id:type,body:{links:[]}},function(err,data){
					if(err) console.error(err);
					//if(type === 'port') self.populate();
				})
				return;
			}
			$scope.$apply(function(){
				self[type] = data._source.links.filter(function(w,index,original){
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
				/*
				if(type === 'port'){
					self.port.forEach(function(w){
						if(portf.indexOf(w.url)===-1) self.delete(w.url,'port')
					})
					self.populate();
				}
				*/
			})
		})
	}
	link.prototype.get = function(url,type){
		if(!type) type = 'widgets';
		var self = this;
		return new Promise(function(resolve,reject){
			if(self.widgets.some(function(link){
				return link.url === url
			})){
				resolve(true);
				return;
			}
			var win = new BrowserWindow({
			    //parent:Yolk.remote('win'),
			    show:false,
				webPreferences:{
				  nodeIntegration: false,
				  webSecurity: true,
				  preload:path.join(Yolk.root,'core/modules/link/lib/tools/scraper.js')
				}
			});
			//win.hide();
			win.loadURL(url);
			win.webContents.on('dom-ready',function(){
				win.webContents.executeJavaScript('Yolk_scrape()').then(function(data){
					win.destroy();
					$scope.$apply(function(){
						data.title = $("<textarea/>").html(data.title).text();
						self[type].push({title:data.title,icon:data.icon,url:url});
						if(type === 'widgets') self.save(type);
					});
					resolve(true)
				})
			}).on('did-fail-load',function(err){
				win.destroy();
				resolve(false);
			})
		})
	}
	link.prototype.delete = function(url,type){
		if(!type) type = 'widgets';
		this[type] = this[type].filter(function(link){
			return link.url !== url;
		});
		this.save('widgets')
	}
	link.prototype.save = function(type){
		//this.populate();
		$scope.db.client.update({index:$scope.db_index,type:'links',id:type,body:{doc:{links:this[type]}},refresh:true},function(err,data){
			if(err) console.error(err);
		})
	}
	link.prototype.populate = function(){
		var self = this;
		portf.forEach(function(url){
			if(!self.port.some(function(w){
				return w.url === url;
			})) self.get(url,'port')
		})

	}
	return link;
}])
