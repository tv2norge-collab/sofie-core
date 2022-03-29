"use strict";(self.webpackChunksofie_documentation=self.webpackChunksofie_documentation||[]).push([[6966],{5318:function(e,t,n){n.d(t,{Zo:function(){return u},kt:function(){return f}});var a=n(7378);function r(e,t,n){return t in e?Object.defineProperty(e,t,{value:n,enumerable:!0,configurable:!0,writable:!0}):e[t]=n,e}function i(e,t){var n=Object.keys(e);if(Object.getOwnPropertySymbols){var a=Object.getOwnPropertySymbols(e);t&&(a=a.filter((function(t){return Object.getOwnPropertyDescriptor(e,t).enumerable}))),n.push.apply(n,a)}return n}function o(e){for(var t=1;t<arguments.length;t++){var n=null!=arguments[t]?arguments[t]:{};t%2?i(Object(n),!0).forEach((function(t){r(e,t,n[t])})):Object.getOwnPropertyDescriptors?Object.defineProperties(e,Object.getOwnPropertyDescriptors(n)):i(Object(n)).forEach((function(t){Object.defineProperty(e,t,Object.getOwnPropertyDescriptor(n,t))}))}return e}function s(e,t){if(null==e)return{};var n,a,r=function(e,t){if(null==e)return{};var n,a,r={},i=Object.keys(e);for(a=0;a<i.length;a++)n=i[a],t.indexOf(n)>=0||(r[n]=e[n]);return r}(e,t);if(Object.getOwnPropertySymbols){var i=Object.getOwnPropertySymbols(e);for(a=0;a<i.length;a++)n=i[a],t.indexOf(n)>=0||Object.prototype.propertyIsEnumerable.call(e,n)&&(r[n]=e[n])}return r}var p=a.createContext({}),l=function(e){var t=a.useContext(p),n=t;return e&&(n="function"==typeof e?e(t):o(o({},t),e)),n},u=function(e){var t=l(e.components);return a.createElement(p.Provider,{value:t},e.children)},c={inlineCode:"code",wrapper:function(e){var t=e.children;return a.createElement(a.Fragment,{},t)}},d=a.forwardRef((function(e,t){var n=e.components,r=e.mdxType,i=e.originalType,p=e.parentName,u=s(e,["components","mdxType","originalType","parentName"]),d=l(n),f=r,m=d["".concat(p,".").concat(f)]||d[f]||c[f]||i;return n?a.createElement(m,o(o({ref:t},u),{},{components:n})):a.createElement(m,o({ref:t},u))}));function f(e,t){var n=arguments,r=t&&t.mdxType;if("string"==typeof e||r){var i=n.length,o=new Array(i);o[0]=d;var s={};for(var p in t)hasOwnProperty.call(t,p)&&(s[p]=t[p]);s.originalType=e,s.mdxType="string"==typeof e?e:r,o[1]=s;for(var l=2;l<i;l++)o[l]=n[l];return a.createElement.apply(null,o)}return a.createElement.apply(null,n)}d.displayName="MDXCreateElement"},2944:function(e,t,n){n.r(t),n.d(t,{frontMatter:function(){return s},contentTitle:function(){return p},metadata:function(){return l},toc:function(){return u},default:function(){return d}});var a=n(5773),r=n(808),i=(n(7378),n(5318)),o=["components"],s={sidebar_position:1},p="Getting Started",l={unversionedId:"user-guide/installation/intro",id:"version-1.37.0/user-guide/installation/intro",isDocsHomePage:!1,title:"Getting Started",description:"Sofie can be installed in many different ways, depending on which platforms, needs, and features you desire. The Sofie system consists of several applications that work together to provide complete broadcast automation system. Each of these components' installation will be covered in this guide. Additional information about the products or services mentioned alongside the Sofie Installation can be found on the Further Reading.",source:"@site/versioned_docs/version-1.37.0/user-guide/installation/intro.md",sourceDirName:"user-guide/installation",slug:"/user-guide/installation/intro",permalink:"/sofie-core/docs/1.37.0/user-guide/installation/intro",editUrl:"https://github.com/nrkno/sofie-core/edit/master/packages/documentation/versioned_docs/version-1.37.0/user-guide/installation/intro.md",tags:[],version:"1.37.0",sidebarPosition:1,frontMatter:{sidebar_position:1},sidebar:"version-1.37.0/gettingStarted",previous:{title:"API",permalink:"/sofie-core/docs/1.37.0/user-guide/features/api"},next:{title:"Quick install",permalink:"/sofie-core/docs/1.37.0/user-guide/installation/installing-sofie-server-core"}},u=[{value:"Sofie Core View",id:"sofie-core-view",children:[]},{value:"Sofie Core Overview",id:"sofie-core-overview",children:[{value:"Gateways",id:"gateways",children:[]},{value:"Blueprints",id:"blueprints",children:[]}]}],c={toc:u};function d(e){var t=e.components,s=(0,r.Z)(e,o);return(0,i.kt)("wrapper",(0,a.Z)({},c,s,{components:t,mdxType:"MDXLayout"}),(0,i.kt)("h1",{id:"getting-started"},"Getting Started"),(0,i.kt)("p",null,(0,i.kt)("em",{parentName:"p"},"Sofie")," can be installed in many different ways, depending on which platforms, needs, and features you desire. The ",(0,i.kt)("em",{parentName:"p"},"Sofie")," system consists of several applications that work together to provide complete broadcast automation system. Each of these components' installation will be covered in this guide. Additional information about the products or services mentioned alongside the Sofie Installation can be found on the ",(0,i.kt)("a",{parentName:"p",href:"../further-reading"},"Further Reading"),"."),(0,i.kt)("p",null,"There are four minimum required components to get a Sofie system up and running. First you need the ",(0,i.kt)("a",{parentName:"p",href:"installing-sofie-server-core"},(0,i.kt)("em",{parentName:"a"},"Sofie\xa0Core")),", which is the brains of the operation. Then a set of ",(0,i.kt)("a",{parentName:"p",href:"installing-blueprints"},(0,i.kt)("em",{parentName:"a"},"Blueprints"))," to handle and interpret incoming and outgoing data. Next, an ",(0,i.kt)("a",{parentName:"p",href:"installing-a-gateway/rundown-or-newsroom-system-connection/intro"},(0,i.kt)("em",{parentName:"a"},"Ingest Gateway"))," to fetch the data for the Blueprints. Then finally, a ",(0,i.kt)("a",{parentName:"p",href:"installing-a-gateway/playout-gateway"},(0,i.kt)("em",{parentName:"a"},"Playout\xa0Gateway"))," to send the data to your playout device of choice."),(0,i.kt)("h2",{id:"sofie-core-view"},"Sofie Core View"),(0,i.kt)("p",null,"The ",(0,i.kt)("em",{parentName:"p"},"Rundowns")," view will display all the active rundowns that the ",(0,i.kt)("em",{parentName:"p"},"Sofie","\xa0","Core")," has access to. "),(0,i.kt)("p",null,(0,i.kt)("img",{alt:"Rundown View",src:n(1362).Z})),(0,i.kt)("p",null,"The ",(0,i.kt)("em",{parentName:"p"},"Status")," views displays the current status for the attached devices and gateways."),(0,i.kt)("p",null,(0,i.kt)("img",{alt:"Status View \u2013 Describes the state of _Sofie\xa0Core_",src:n(1887).Z})),(0,i.kt)("p",null,"The ",(0,i.kt)("em",{parentName:"p"},"Settings")," views contains various settings for the studio, show styles, blueprints etc.. If the link to the settings view is not visible in your application, check your ",(0,i.kt)("a",{parentName:"p",href:"../features/access-levels"},"Access Levels"),". More info on specific parts of the ",(0,i.kt)("em",{parentName:"p"},"Settings")," view can be found in their corresponding guide sections. "),(0,i.kt)("p",null,(0,i.kt)("img",{alt:"Settings View \u2013 Describes how the _Sofie\xa0Core_ is configured",src:n(7299).Z})),(0,i.kt)("h2",{id:"sofie-core-overview"},"Sofie Core Overview"),(0,i.kt)("p",null,"The ",(0,i.kt)("em",{parentName:"p"},"Sofie","\xa0","Core")," is the primary application for managing the broadcast but, it doesn't play anything out on it's own. You need to use Gateways to establish the connection from the ",(0,i.kt)("em",{parentName:"p"},"Sofie","\xa0","Core")," to other pieces of hardware or remote software. "),(0,i.kt)("h3",{id:"gateways"},"Gateways"),(0,i.kt)("p",null,"Gateways are separate applications that bridge the gap between the ",(0,i.kt)("em",{parentName:"p"},"Sofie","\xa0","Core")," and other pieces of hardware or services. At minimum, you will need a ",(0,i.kt)("em",{parentName:"p"},"Playout Gateway")," so your timeline can interact with your playout system of choice. To install the ",(0,i.kt)("em",{parentName:"p"},"Playout Gateway"),", visit the ",(0,i.kt)("a",{parentName:"p",href:"installing-a-gateway/intro"},"Installing a Gateway")," section of this guide and for a more in-depth look, please see ",(0,i.kt)("a",{parentName:"p",href:"../concepts-and-architecture#gateways"},"Gateways"),". "),(0,i.kt)("h3",{id:"blueprints"},"Blueprints"),(0,i.kt)("p",null,"Blueprints can be described as the logic that determines how a studio and show should interact with one another. They interpret the data coming in from the rundowns and transform them into a rich set of playable elements ","(",(0,i.kt)("em",{parentName:"p"},"Segments"),", ",(0,i.kt)("em",{parentName:"p"},"Parts"),", ",(0,i.kt)("em",{parentName:"p"},"AdLibs,")," etcetera",")",". The ",(0,i.kt)("em",{parentName:"p"},"Sofie","\xa0","Core")," has three main blueprint types, ",(0,i.kt)("em",{parentName:"p"},"System Blueprints"),", ",(0,i.kt)("em",{parentName:"p"},"Studio Blueprints"),", and ",(0,i.kt)("em",{parentName:"p"},"Showstyle Blueprints"),". Installing ",(0,i.kt)("em",{parentName:"p"},"Sofie")," does not require you understand what these blueprints do, just that they are required for the ",(0,i.kt)("em",{parentName:"p"},"Sofie","\xa0","Core")," to work. If you would like to gain a deeper understand of how ",(0,i.kt)("em",{parentName:"p"},"Blueprints")," work, please visit the ",(0,i.kt)("a",{parentName:"p",href:"#blueprints"},"Blueprints")," section."))}d.isMDXComponent=!0},1362:function(e,t,n){t.Z=n.p+"assets/images/rundowns-in-sofie-3ba51c8f67373b20734018c1c46e5348.png"},7299:function(e,t,n){t.Z=n.p+"assets/images/settings-page-33137c9de738f375484e364b4c0ad1af.jpg"},1887:function(e,t,n){t.Z=n.p+"assets/images/status-page-9eefb0022cb47f54c22fd5da4597114d.jpg"}}]);