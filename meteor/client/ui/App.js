import React, { Component } from 'react';
import ReactDOM from 'react-dom';
import Task from './Task.js';
import { withTracker } from 'meteor/react-meteor-data';
import { Tasks } from '/lib/collections/tasks.js';

// App component - represents the whole app
class App extends Component {


renderTasks() {
	//console.log(this.props);
	return this.props.tasks.map((task) => (
		<Task key={task._id} task={task} />
	));
}
handleSubmit(event) {
	event.preventDefault();

	// Find the text field via the React ref
	//console.log('this.refs',this.refs);
	const text = ReactDOM.findDOMNode(this.refs.textInput).value.trim();

	Tasks.insert({
		text,
		createdAt: new Date(), // current time
	});

	// Clear form
	ReactDOM.findDOMNode(this.refs.textInput).value = '';
}

render() {

	return (
		<div className="container">
		<header>
			<h1>Todo List</h1>

			<form className="new-task" onSubmit={this.handleSubmit.bind(this)} >
				<input
				type="text"
				ref="textInput"
				placeholder="Type to add new tasks"
			/>
			</form>

		</header>

		<ul>
			{this.renderTasks()}
		</ul>
		</div>
	);
}
}

export default withTracker(() => {
	//console.log('Tasks',Tasks);
	//console.log('Tasks.find({}).fetch()',Tasks.find({}, { sort: { createdAt: -1 } }).fetch());

	return {
		tasks: Tasks.find({}, { sort: { createdAt: -1 } }).fetch(),
	};
})(App);