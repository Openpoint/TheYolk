'use strict';

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
	var location = $location.search().loc;
	console.warn(location)
	var loaded = false;
	$scope.go=function(loc,state){
		if(state && loc==='home') webView.loadURL(location);
		if(state && loc==='back') webView.goBack();
		if(state && loc==='forward') webView.goForward();
	}
	$scope.his = function(url){
		var p = Url.parse(url);
		var p2 = Url.parse(location);
		p = p.host+p.path;
		p2 = p2.host+p2.path;
		console.log(p2,p)
		$scope.$apply(function(){
			$scope.history = {
				back:webview.canGoBack()?true:false,
				forward:webview.canGoForward()?true:false,
				home:p2===p?false:location
			}
			console.log($scope.history);
		})
	}
	webview.addEventListener("dom-ready", function(){
		if(!loaded){
			webView.loadURL(location);
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
		}
	});
}])
