'use strict';

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

angular.module('yolk').controller('link', ['$scope','$location',function($scope,$location) {
	const {shell} = require('electron');
	const mod_name = 'link';
	const Url = require('url');

	Yolk.prepare($scope,mod_name)

	/*
	const session = Yolk.remote('session');
	const filter = {
		urls: ['*://*.openpoint.ie', '*://openpoint.ie']
	}

	session.defaultSession.webRequest.onBeforeSendHeaders(filter, (details, callback) => {
		console.log(details)
	})
	*/

	var webView = document.querySelector('webview');


	$scope.Location = $location.search().loc;
	var loaded = false;
	$scope.go=function(loc,state){
		if(state && loc==='home') webView.loadURL($scope.Location);
		if(state && loc==='back') webView.goBack();
		if(state && loc==='forward') webView.goForward();
	}
	$scope.his = function(url){
		var p = Url.parse(url);
		var p2 = Url.parse($scope.Location);
		p = p.host+p.path;
		p2 = p2.host+p2.path;
		$scope.$apply(function(){
			$scope.history = {
				back:webview.canGoBack()?true:false,
				forward:webview.canGoForward()?true:false,
				home:p2===p?false:$scope.Location
			}
		})
	}
	webview.addEventListener("dom-ready", function(){
		if(webview.getURL().indexOf('data:')===0){
			$('.wait').show();
		}else{
			$('.wait').hide();
		}
		if(!loaded){
			webView.loadURL($scope.Location);
			webview.clearHistory();
		}

		$scope.his(webview.getURL());
		loaded = true;
	});

	webview.addEventListener('new-window', function(e){
		var protocol = Url.parse(e.url).protocol
		if (protocol === 'http:' || protocol === 'https:') {
			console.log('new window event called');
			webView.loadURL(e.url);
			$scope.his(e.url);
		}else{
			console.log('default view')
		}
	});
}])
