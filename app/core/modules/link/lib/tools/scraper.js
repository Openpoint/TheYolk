"use strict"

document.addEventListener("DOMNodeInserted", function(event) {
    if(!window.jQuery){
        window.$Yolk = window.jQuery = require('jquery');
    }else{
		window.$Yolk = window.jQuery
	}
})
window.Yolk_scrape = function(){
	var title;
	$Yolk('head title').length?title = $Yolk('head title').html():title=false;
	var icon;
	var indom = $Yolk('head link[rel="shortcut icon"], head link[rel="icon"], head link[rel="shortcut"]');
	indom.length?icon = indom[0].href:icon=false;
	return new Promise(function(resolve,reject){
		resolve({
			title:title,
			icon:icon
		});
	})
}
