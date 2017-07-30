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

document.addEventListener("DOMContentLoaded", function(event) {
    if(!window.jQuery){
		console.log('one')
        window.$Yolk = require('jquery');
    }else{
		console.log('two')
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
