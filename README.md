# AmaraBot

**AmaraBot** — short for *Amarantos Robot*, meaning *the robot that never withers*.  

AmaraBot is a next-generation interactive AI system that combines virtual and physical presence.  
It features:  

- **Emotional Expression**: A front-end 3D avatar capable of displaying rich facial expressions and gestures in real time.  
- **Physical Integration**: Can be connected with a robot entity, enabling direct interaction between humans and machines.  
- **Lightweight Deployment**: Designed for minimal local setup, ensuring smooth performance without heavy infrastructure.  
- **Developer-Friendly**: Provides open and flexible interfaces for quick customization and integration into different applications.  

With AmaraBot, users can not only engage in natural, emotionally expressive conversations but also interact directly with a robot in the physical world — bridging digital and real-life experiences.  

## Core Technologies

AmaraBot is powered by a combination of advanced AI and real-time interaction technologies:

- **LLM (Large Language Model)**: Provides natural, context-aware dialogue generation with emotional nuance.  
- **TTS (Text-to-Speech)**: Converts responses into natural, expressive voice output.  
- **ASR (Automatic Speech Recognition)**: Enables real-time voice input, allowing users to interact with AmaraBot seamlessly through speech.  
- **Audio to Blendshapes**: Translates audio features into facial expressions and lip-sync animations, bringing the 3D avatar to life with synchronized emotion and movement.  

Together, these technologies make AmaraBot a truly interactive system — capable of understanding, speaking, expressing, and even connecting with a physical robot counterpart.


## Social Impact

AmaraBot is not only a technological innovation, but also a platform that can bring meaningful impact to society:

- **Companionship & Emotional Support**: Provides interactive companionship for the elderly, children, or individuals living alone, offering comfort through expressive conversations.  
- **Education & Training**: Acts as an intelligent tutor or training assistant, making learning more engaging through natural interaction and vivid expressions.  
- **Healthcare Assistance**: Supports patients with communication needs, offering a friendly interface for mental health support and basic guidance.  
- **Accessibility & Inclusion**: Breaks down barriers for people with disabilities by offering voice-driven interaction and expressive avatars that enhance communication.  
- **Human–Robot Collaboration**: Serves as a bridge between humans and machines, making robotics more approachable, trustworthy, and socially acceptable.  

By combining emotional intelligence with physical interaction, AmaraBot has the potential to improve quality of life, enhance education, and foster greater inclusivity in human–machine communication.

## Future Plans

AmaraBot is an evolving platform with a roadmap to expand its capabilities and ecosystem:

- **Enriched MCP Interfaces**: Broaden support for Modular Communication Protocol (MCP) interfaces, enabling AmaraBot to connect with more applications, devices, and external services.  
- **Content Integration**: Access a wider variety of data sources and knowledge bases, providing richer, more dynamic interactions and task execution.  
- **Vision-Language Model (VLM) Integration**: Extend beyond speech and text by adding multimodal understanding. With VLM, AmaraBot will be able to perceive and interpret visual inputs, unlocking new possibilities in real-world tasks.  
- **Enhanced Human–Robot Collaboration**: By combining language, vision, and physical interaction, AmaraBot aims to support more complex workflows — from education and customer service to healthcare and creative industries.  

Through these advancements, AmaraBot will grow from an expressive companion into a versatile assistant capable of contributing across diverse domains.


## Quike Start

### Requirements
- Nvidia GTX1060 or Above GPU
- xiaozhi-esp32-server Installed
- NeuroSync_Local_API Installed
- Robot with Serial Commication (Optional)

### Fast Run
1. Install xiaozhi-esp32-server and run the service
2. Install NeuroSync_Local_API and run it
3. Clone this project to your disk
   ```
   python -m http.server 8007
   ```
4. Open website and click ./test/test_all_in_3d_env.html
5. Setup all settings, such as XiaoZhi server port, NeuroSync Port.
6. Choose your own avatar or just use the default one.
7. Enjoy it!

### Personal Customize
- If you wanna change your default avatar, replace the file in ./character
- If you wanna change AmaraBot's talking style and voice, go to ./config.yml in XiaoZhi Server
