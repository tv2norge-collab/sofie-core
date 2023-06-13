"use strict";(self.webpackChunksofie_documentation=self.webpackChunksofie_documentation||[]).push([[4866],{2628:(e,t,o)=>{o.r(t),o.d(t,{assets:()=>l,contentTitle:()=>i,default:()=>u,frontMatter:()=>a,metadata:()=>s,toc:()=>d});var r=o(5773),n=(o(7378),o(5318));const a={title:"Worker Threads & Locks"},i=void 0,s={unversionedId:"for-developers/worker-threads-and-locks",id:"version-1.41.0/for-developers/worker-threads-and-locks",title:"Worker Threads & Locks",description:"Starting with v1.40.0 (Release 40), the core logic of Sofie is split across",source:"@site/versioned_docs/version-1.41.0/for-developers/worker-threads-and-locks.md",sourceDirName:"for-developers",slug:"/for-developers/worker-threads-and-locks",permalink:"/sofie-core/docs/1.41.0/for-developers/worker-threads-and-locks",draft:!1,editUrl:"https://github.com/nrkno/sofie-core/edit/master/packages/documentation/versioned_docs/version-1.41.0/for-developers/worker-threads-and-locks.md",tags:[],version:"1.41.0",frontMatter:{title:"Worker Threads & Locks"},sidebar:"version-1.41.0/forDevelopers",previous:{title:"API Documentation",permalink:"/sofie-core/docs/1.41.0/for-developers/api-documentation"}},l={},d=[{value:"The Worker",id:"the-worker",level:3},{value:"Locks",id:"locks",level:3},{value:"PlaylistLock",id:"playlistlock",level:4},{value:"RundownLock",id:"rundownlock",level:4}],p={toc:d},c="wrapper";function u(e){let{components:t,...o}=e;return(0,n.kt)(c,(0,r.Z)({},p,o,{components:t,mdxType:"MDXLayout"}),(0,n.kt)("p",null,"Starting with v1.40.0 (",(0,n.kt)("em",{parentName:"p"},(0,n.kt)("a",{parentName:"em",href:"/sofie-core/docs/releases#release-40"},"Release 40")),"), the core logic of Sofie is split across\nmultiple threads. This has been done to minimise performance bottlenecks such as ingest changes delaying takes. In its\ncurrent state, it should not impact deployment of Sofie."),(0,n.kt)("p",null,"In the initial implementation, these threads are run through ",(0,n.kt)("a",{parentName:"p",href:"https://github.com/nytamin/threadedclass"},"threadedClass"),"\ninside of Meteor. As Meteor does not support the use of ",(0,n.kt)("inlineCode",{parentName:"p"},"worker_threads"),", and to allow for future separation, the\n",(0,n.kt)("inlineCode",{parentName:"p"},"worker_threads")," are treated and implemented as if they are outside of the Meteor ecosystem. The code is isolated from\nMeteor inside of ",(0,n.kt)("inlineCode",{parentName:"p"},"packages/job-worker"),", with some shared code placed in ",(0,n.kt)("inlineCode",{parentName:"p"},"packages/corelib"),"."),(0,n.kt)("p",null,"Prior to v1.40.0, there was already a work-queue of sorts in Meteor. As such the functions were defined pretty well to\ntranslate across to being on a true work queue. For now this work queue is still in-memory in the Meteor process, but we\nintend to investigate relocating this in a future release. This will be necessary as part of a larger task of allowing\nus to scale Meteor for better resiliency. Many parts of the worker system have been designed with this in mind, and so\nhave sufficient abstraction in place already."),(0,n.kt)("h3",{id:"the-worker"},"The Worker"),(0,n.kt)("p",null,"The worker process is designed to run the work for one or more studios. The initial implementation will run for all\nstudios in the database, and is monitoring for studios to be added or removed."),(0,n.kt)("p",null,"For each studio, the worker runs 3 threads:"),(0,n.kt)("ol",null,(0,n.kt)("li",{parentName:"ol"},"The Studio/Playout thread. This is where all the playout operations are executed, as well as other operations that\nrequire 'ownership' of the Studio"),(0,n.kt)("li",{parentName:"ol"},"The Ingest thread. This is where all the MOS/Ingest updates are handled and fed through the bluerpints."),(0,n.kt)("li",{parentName:"ol"},"The events thread. Some low-priority tasks are pushed to here. Such as notifying ENPS about ",(0,n.kt)("em",{parentName:"li"},"the yellow line"),", or the\nBlueprints methods used to generate External-Messages for As-Run Log.")),(0,n.kt)("p",null,"In future it is expected that there will be multiple ingest threads. How the work will be split across them is yet to be\ndetermined"),(0,n.kt)("h3",{id:"locks"},"Locks"),(0,n.kt)("p",null,"At times, the playout and ingest threads both need to take ownership of ",(0,n.kt)("inlineCode",{parentName:"p"},"RundownPlaylists")," and ",(0,n.kt)("inlineCode",{parentName:"p"},"Rundowns"),"."),(0,n.kt)("p",null,"To facilitate this, there are a couple of lock types in Sofie. These are coordinated by the parent thread in the worker\nprocess."),(0,n.kt)("h4",{id:"playlistlock"},"PlaylistLock"),(0,n.kt)("p",null,"This lock gives ownership of a specific ",(0,n.kt)("inlineCode",{parentName:"p"},"RundownPlaylist"),". It is required to be able to load a ",(0,n.kt)("inlineCode",{parentName:"p"},"CacheForPlayout"),", and\nmust held during other times where the ",(0,n.kt)("inlineCode",{parentName:"p"},"RundownPlaylist")," is modified or is expected to not change."),(0,n.kt)("h4",{id:"rundownlock"},"RundownLock"),(0,n.kt)("p",null,"This lock gives ownership of a specific ",(0,n.kt)("inlineCode",{parentName:"p"},"Rundown"),". It is required to be able to load a ",(0,n.kt)("inlineCode",{parentName:"p"},"CacheForIngest"),", and must held\nduring other times where the ",(0,n.kt)("inlineCode",{parentName:"p"},"Rundown")," is modified or is expected to not change."),(0,n.kt)("div",{className:"admonition admonition-caution alert alert--warning"},(0,n.kt)("div",{parentName:"div",className:"admonition-heading"},(0,n.kt)("h5",{parentName:"div"},(0,n.kt)("span",{parentName:"h5",className:"admonition-icon"},(0,n.kt)("svg",{parentName:"span",xmlns:"http://www.w3.org/2000/svg",width:"16",height:"16",viewBox:"0 0 16 16"},(0,n.kt)("path",{parentName:"svg",fillRule:"evenodd",d:"M8.893 1.5c-.183-.31-.52-.5-.887-.5s-.703.19-.886.5L.138 13.499a.98.98 0 0 0 0 1.001c.193.31.53.501.886.501h13.964c.367 0 .704-.19.877-.5a1.03 1.03 0 0 0 .01-1.002L8.893 1.5zm.133 11.497H6.987v-2.003h2.039v2.003zm0-3.004H6.987V5.987h2.039v4.006z"}))),"caution")),(0,n.kt)("div",{parentName:"div",className:"admonition-content"},(0,n.kt)("p",{parentName:"div"},"It is not allowed to aquire a ",(0,n.kt)("inlineCode",{parentName:"p"},"RundownLock")," while inside of a ",(0,n.kt)("inlineCode",{parentName:"p"},"PlaylistLock"),". This is to avoid deadlocks, as it is very\ncommon to aquire a ",(0,n.kt)("inlineCode",{parentName:"p"},"PlaylistLock")," inside of a ",(0,n.kt)("inlineCode",{parentName:"p"},"RundownLock")))))}u.isMDXComponent=!0},5318:(e,t,o)=>{o.d(t,{Zo:()=>p,kt:()=>m});var r=o(7378);function n(e,t,o){return t in e?Object.defineProperty(e,t,{value:o,enumerable:!0,configurable:!0,writable:!0}):e[t]=o,e}function a(e,t){var o=Object.keys(e);if(Object.getOwnPropertySymbols){var r=Object.getOwnPropertySymbols(e);t&&(r=r.filter((function(t){return Object.getOwnPropertyDescriptor(e,t).enumerable}))),o.push.apply(o,r)}return o}function i(e){for(var t=1;t<arguments.length;t++){var o=null!=arguments[t]?arguments[t]:{};t%2?a(Object(o),!0).forEach((function(t){n(e,t,o[t])})):Object.getOwnPropertyDescriptors?Object.defineProperties(e,Object.getOwnPropertyDescriptors(o)):a(Object(o)).forEach((function(t){Object.defineProperty(e,t,Object.getOwnPropertyDescriptor(o,t))}))}return e}function s(e,t){if(null==e)return{};var o,r,n=function(e,t){if(null==e)return{};var o,r,n={},a=Object.keys(e);for(r=0;r<a.length;r++)o=a[r],t.indexOf(o)>=0||(n[o]=e[o]);return n}(e,t);if(Object.getOwnPropertySymbols){var a=Object.getOwnPropertySymbols(e);for(r=0;r<a.length;r++)o=a[r],t.indexOf(o)>=0||Object.prototype.propertyIsEnumerable.call(e,o)&&(n[o]=e[o])}return n}var l=r.createContext({}),d=function(e){var t=r.useContext(l),o=t;return e&&(o="function"==typeof e?e(t):i(i({},t),e)),o},p=function(e){var t=d(e.components);return r.createElement(l.Provider,{value:t},e.children)},c="mdxType",u={inlineCode:"code",wrapper:function(e){var t=e.children;return r.createElement(r.Fragment,{},t)}},h=r.forwardRef((function(e,t){var o=e.components,n=e.mdxType,a=e.originalType,l=e.parentName,p=s(e,["components","mdxType","originalType","parentName"]),c=d(o),h=n,m=c["".concat(l,".").concat(h)]||c[h]||u[h]||a;return o?r.createElement(m,i(i({ref:t},p),{},{components:o})):r.createElement(m,i({ref:t},p))}));function m(e,t){var o=arguments,n=t&&t.mdxType;if("string"==typeof e||n){var a=o.length,i=new Array(a);i[0]=h;var s={};for(var l in t)hasOwnProperty.call(t,l)&&(s[l]=t[l]);s.originalType=e,s[c]="string"==typeof e?e:n,i[1]=s;for(var d=2;d<a;d++)i[d]=o[d];return r.createElement.apply(null,i)}return r.createElement.apply(null,o)}h.displayName="MDXCreateElement"}}]);