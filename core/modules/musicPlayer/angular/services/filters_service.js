angular.module('yolk').factory('filters',[function() {
	
	var filters=function(){
		this.artist = function(a1,a2){
			if(a1 && a2 && a1.trim().toLowerCase() === a2.trim().toLowerCase()){
				//console.log(a1+' : '+a2);
				return true;
			}else{
				return false;
			}
		}
	}
	filters.prototype.add = function(id,fnc){
		if(!this[id]){
			this[id] = fnc;
		}
	}
	
	return new filters();
}])
