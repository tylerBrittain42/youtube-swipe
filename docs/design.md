# Design

## Goal

I want to have a swiping(Tinder-like) interface in order to access a specified youtube playlist(ie:watch later). A left or right swip will either indicate to keep the video, move to another playlist downstream(see _downstream_) or a swipe up will be treated as watch now(in a new tab)

## Downstream

A downstream playlist can be thought of as a reject playlist. 

## Extensibility

I want to keep the frontend and backend decoupled in order to allow this frontend to interact with any API that meets the requirements.

### Frontend

#### UI

- A box with the video title, thumbnail, author, and runtime. It should be swipable left right and up. Swiping any way will trigger an event and load the next box

#### Functoinality

1. A box is loaded
1. User swipes triggering an event
   1. Each swip direction triggers a different event.
   1. swipe up opens video in new tab
1. A new box is loaded(Assume that the backend has a get-next endpoint)

### Backend

This will be the tricky part so we can do this last. This is rough idea, not a commitment. Skip implementation for now.

#### Potential challenges

Google account interactions

#### API Endpoints

- `get-next` Gets the next n many videos from specificed youtube playlist(assume it is the watch later playlist for now)
- `keep` does nothing, just return 200. Will use this later, but not sure how yet
- `move` move to reject playlist, remove from current playlist
